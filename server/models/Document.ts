// @ts-expect-error ts-migrate(7016) FIXME: Could not find a declaration file for module '@tom... Remove this comment to see the full error message
import removeMarkdown from "@tommoor/remove-markdown";
import { compact, find, map, uniq } from "lodash";
import randomstring from "randomstring";
import Sequelize, { Transaction } from "sequelize";
// @ts-expect-error ts-migrate(7016) FIXME: Could not find a declaration file for module 'slat... Remove this comment to see the full error message
import MarkdownSerializer from "slate-md-serializer";
import isUUID from "validator/lib/isUUID";
import { MAX_TITLE_LENGTH } from "@shared/constants";
import { DateFilter } from "@shared/types";
import getTasks from "@shared/utils/getTasks";
import parseTitle from "@shared/utils/parseTitle";
import { SLUG_URL_REGEX } from "@shared/utils/routeHelpers";
import unescape from "@shared/utils/unescape";
import { Collection, User } from "@server/models";
import slugify from "@server/utils/slugify";
import { DataTypes, sequelize } from "../sequelize";
import Revision from "./Revision";

const Op = Sequelize.Op;
const serializer = new MarkdownSerializer();

export const DOCUMENT_VERSION = 2;

// @ts-expect-error ts-migrate(7006) FIXME: Parameter 'doc' implicitly has an 'any' type.
const createUrlId = (doc) => {
  return (doc.urlId = doc.urlId || randomstring.generate(10));
};

// @ts-expect-error ts-migrate(7006) FIXME: Parameter 'doc' implicitly has an 'any' type.
const beforeCreate = async (doc) => {
  if (doc.version === undefined) {
    doc.version = DOCUMENT_VERSION;
  }

  return beforeSave(doc);
};

// @ts-expect-error ts-migrate(7006) FIXME: Parameter 'doc' implicitly has an 'any' type.
const beforeSave = async (doc) => {
  const { emoji } = parseTitle(doc.text);
  // emoji in the title is split out for easier display
  doc.emoji = emoji;
  // ensure documents have a title
  doc.title = doc.title || "";

  if (doc.previous("title") && doc.previous("title") !== doc.title) {
    if (!doc.previousTitles) doc.previousTitles = [];
    doc.previousTitles = uniq(doc.previousTitles.concat(doc.previous("title")));
  }

  // add the current user as a collaborator on this doc
  if (!doc.collaboratorIds) doc.collaboratorIds = [];
  doc.collaboratorIds = uniq(doc.collaboratorIds.concat(doc.lastModifiedById));
  // increment revision
  doc.revisionCount += 1;
  return doc;
};

const Document = sequelize.define(
  "document",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    urlId: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      validate: {
        len: {
          args: [0, MAX_TITLE_LENGTH],
          msg: `Document title must be less than ${MAX_TITLE_LENGTH} characters`,
        },
      },
    },
    previousTitles: DataTypes.ARRAY(DataTypes.STRING),
    version: DataTypes.SMALLINT,
    template: DataTypes.BOOLEAN,
    fullWidth: DataTypes.BOOLEAN,
    editorVersion: DataTypes.STRING,
    text: DataTypes.TEXT,
    state: DataTypes.BLOB,
    isWelcome: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    revisionCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    archivedAt: DataTypes.DATE,
    publishedAt: DataTypes.DATE,
    parentDocumentId: DataTypes.UUID,
    collaboratorIds: DataTypes.ARRAY(DataTypes.UUID),
  },
  {
    paranoid: true,
    hooks: {
      beforeValidate: createUrlId,
      beforeCreate: beforeCreate,
      beforeUpdate: beforeSave,
    },
    getterMethods: {
      url: function () {
        if (!this.title) return `/doc/untitled-${this.urlId}`;
        const slugifiedTitle = slugify(this.title);
        return `/doc/${slugifiedTitle}-${this.urlId}`;
      },
      tasks: function () {
        return getTasks(this.text || "");
      },
    },
  }
);

// Class methods
// @ts-expect-error ts-migrate(7006) FIXME: Parameter 'models' implicitly has an 'any' type.
Document.associate = (models) => {
  Document.belongsTo(models.Collection, {
    as: "collection",
    foreignKey: "collectionId",
    onDelete: "cascade",
  });
  Document.belongsTo(models.Team, {
    as: "team",
    foreignKey: "teamId",
  });
  Document.belongsTo(models.Document, {
    as: "document",
    foreignKey: "templateId",
  });
  Document.belongsTo(models.User, {
    as: "createdBy",
    foreignKey: "createdById",
  });
  Document.belongsTo(models.User, {
    as: "updatedBy",
    foreignKey: "lastModifiedById",
  });
  Document.belongsTo(models.User, {
    as: "pinnedBy",
    foreignKey: "pinnedById",
  });
  Document.hasMany(models.Revision, {
    as: "revisions",
    onDelete: "cascade",
  });
  Document.hasMany(models.Backlink, {
    as: "backlinks",
    onDelete: "cascade",
  });
  Document.hasMany(models.Star, {
    as: "starred",
    onDelete: "cascade",
  });
  Document.hasMany(models.View, {
    as: "views",
  });
  Document.addScope("defaultScope", {
    include: [
      {
        model: models.User,
        as: "createdBy",
        paranoid: false,
      },
      {
        model: models.User,
        as: "updatedBy",
        paranoid: false,
      },
    ],
    where: {
      publishedAt: {
        [Op.ne]: null,
      },
    },
  });
  // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'userId' implicitly has an 'any' type.
  Document.addScope("withCollection", (userId, paranoid = true) => {
    if (userId) {
      return {
        include: [
          {
            model: models.Collection.scope({
              method: ["withMembership", userId],
            }),
            as: "collection",
            paranoid,
          },
        ],
      };
    }

    return {
      include: [
        {
          model: models.Collection,
          as: "collection",
        },
      ],
    };
  });
  Document.addScope("withUnpublished", {
    include: [
      {
        model: models.User,
        as: "createdBy",
        paranoid: false,
      },
      {
        model: models.User,
        as: "updatedBy",
        paranoid: false,
      },
    ],
  });
  // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'userId' implicitly has an 'any' type.
  Document.addScope("withViews", (userId) => {
    if (!userId) return {};
    return {
      include: [
        {
          model: models.View,
          as: "views",
          where: {
            userId,
          },
          required: false,
          separate: true,
        },
      ],
    };
  });
  // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'userId' implicitly has an 'any' type.
  Document.addScope("withStarred", (userId) => ({
    include: [
      {
        model: models.Star,
        as: "starred",
        where: {
          userId,
        },
        required: false,
        separate: true,
      },
    ],
  }));
};

// @ts-expect-error ts-migrate(7006) FIXME: Parameter 'id' implicitly has an 'any' type.
Document.findByPk = async function (id, options = {}) {
  // allow default preloading of collection membership if `userId` is passed in find options
  // almost every endpoint needs the collection membership to determine policy permissions.
  const scope = this.scope(
    "withUnpublished",
    {
      // @ts-expect-error ts-migrate(2339) FIXME: Property 'userId' does not exist on type '{}'.
      method: ["withCollection", options.userId, options.paranoid],
    },
    {
      // @ts-expect-error ts-migrate(2339) FIXME: Property 'userId' does not exist on type '{}'.
      method: ["withViews", options.userId],
    }
  );

  if (isUUID(id)) {
    return scope.findOne({
      where: {
        id,
      },
      ...options,
    });
  } else if (id.match(SLUG_URL_REGEX)) {
    return scope.findOne({
      where: {
        urlId: id.match(SLUG_URL_REGEX)[1],
      },
      ...options,
    });
  }
};

type SearchResponse = {
  results: {
    ranking: number;
    context: string;
    document: Document;
  }[];
  totalCount: number;
};
type SearchOptions = {
  limit?: number;
  offset?: number;
  collectionId?: string;
  dateFilter?: DateFilter;
  collaboratorIds?: string[];
  includeArchived?: boolean;
  includeDrafts?: boolean;
};

function escape(query: string): string {
  // replace "\" with escaped "\\" because sequelize.escape doesn't do it
  // https://github.com/sequelize/sequelize/issues/2950
  return sequelize.escape(query).replace(/\\/g, "\\\\");
}

Document.searchForTeam = async (
  // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'team' implicitly has an 'any' type.
  team,
  // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'query' implicitly has an 'any' type.
  query,
  options: SearchOptions = {}
): Promise<SearchResponse> => {
  const limit = options.limit || 15;
  const offset = options.offset || 0;
  const wildcardQuery = `${escape(query)}:*`;
  const collectionIds = await team.collectionIds();

  // If the team has access no public collections then shortcircuit the rest of this
  if (!collectionIds.length) {
    return {
      results: [],
      totalCount: 0,
    };
  }

  // Build the SQL query to get documentIds, ranking, and search term context
  const whereClause = `
  "searchVector" @@ to_tsquery('english', :query) AND
    "teamId" = :teamId AND
    "collectionId" IN(:collectionIds) AND
    "deletedAt" IS NULL AND
    "publishedAt" IS NOT NULL
  `;
  const selectSql = `
    SELECT
      id,
      ts_rank(documents."searchVector", to_tsquery('english', :query)) as "searchRanking",
      ts_headline('english', "text", to_tsquery('english', :query), 'MaxFragments=1, MinWords=20, MaxWords=30') as "searchContext"
    FROM documents
    WHERE ${whereClause}
    ORDER BY
      "searchRanking" DESC,
      "updatedAt" DESC
    LIMIT :limit
    OFFSET :offset;
  `;
  const countSql = `
    SELECT COUNT(id)
    FROM documents
    WHERE ${whereClause}
  `;
  const queryReplacements = {
    teamId: team.id,
    query: wildcardQuery,
    collectionIds,
  };
  const resultsQuery = sequelize.query(selectSql, {
    type: sequelize.QueryTypes.SELECT,
    replacements: { ...queryReplacements, limit, offset },
  });
  const countQuery = sequelize.query(countSql, {
    type: sequelize.QueryTypes.SELECT,
    replacements: queryReplacements,
  });
  const [results, [{ count }]] = await Promise.all([resultsQuery, countQuery]);
  // Final query to get associated document data
  const documents = await Document.findAll({
    where: {
      id: map(results, "id"),
    },
    include: [
      {
        model: Collection,
        as: "collection",
      },
      {
        model: User,
        as: "createdBy",
        paranoid: false,
      },
      {
        model: User,
        as: "updatedBy",
        paranoid: false,
      },
    ],
  });
  return {
    results: map(results, (result) => ({
      ranking: result.searchRanking,
      context: removeMarkdown(unescape(result.searchContext), {
        stripHTML: false,
      }),
      document: find(documents, {
        id: result.id,
      }),
    })),
    totalCount: count,
  };
};

Document.searchForUser = async (
  // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'user' implicitly has an 'any' type.
  user,
  // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'query' implicitly has an 'any' type.
  query,
  options: SearchOptions = {}
): Promise<SearchResponse> => {
  const limit = options.limit || 15;
  const offset = options.offset || 0;
  const wildcardQuery = `${escape(query)}:*`;
  // Ensure we're filtering by the users accessible collections. If
  // collectionId is passed as an option it is assumed that the authorization
  // has already been done in the router
  let collectionIds;

  if (options.collectionId) {
    collectionIds = [options.collectionId];
  } else {
    collectionIds = await user.collectionIds();
  }

  // If the user has access to no collections then shortcircuit the rest of this
  if (!collectionIds.length) {
    return {
      results: [],
      totalCount: 0,
    };
  }

  let dateFilter;

  if (options.dateFilter) {
    dateFilter = `1 ${options.dateFilter}`;
  }

  // Build the SQL query to get documentIds, ranking, and search term context
  const whereClause = `
  "searchVector" @@ to_tsquery('english', :query) AND
    "teamId" = :teamId AND
    "collectionId" IN(:collectionIds) AND
    ${
      options.dateFilter ? '"updatedAt" > now() - interval :dateFilter AND' : ""
    }
    ${
      options.collaboratorIds
        ? '"collaboratorIds" @> ARRAY[:collaboratorIds]::uuid[] AND'
        : ""
    }
    ${options.includeArchived ? "" : '"archivedAt" IS NULL AND'}
    "deletedAt" IS NULL AND
    ${
      options.includeDrafts
        ? '("publishedAt" IS NOT NULL OR "createdById" = :userId)'
        : '"publishedAt" IS NOT NULL'
    }
  `;
  const selectSql = `
  SELECT
    id,
    ts_rank(documents."searchVector", to_tsquery('english', :query)) as "searchRanking",
    ts_headline('english', "text", to_tsquery('english', :query), 'MaxFragments=1, MinWords=20, MaxWords=30') as "searchContext"
  FROM documents
  WHERE ${whereClause}
  ORDER BY
    "searchRanking" DESC,
    "updatedAt" DESC
  LIMIT :limit
  OFFSET :offset;
  `;
  const countSql = `
    SELECT COUNT(id)
    FROM documents
    WHERE ${whereClause}
  `;
  const queryReplacements = {
    teamId: user.teamId,
    userId: user.id,
    collaboratorIds: options.collaboratorIds,
    query: wildcardQuery,
    collectionIds,
    dateFilter,
  };
  const resultsQuery = sequelize.query(selectSql, {
    type: sequelize.QueryTypes.SELECT,
    replacements: { ...queryReplacements, limit, offset },
  });
  const countQuery = sequelize.query(countSql, {
    type: sequelize.QueryTypes.SELECT,
    replacements: queryReplacements,
  });
  const [results, [{ count }]] = await Promise.all([resultsQuery, countQuery]);
  // Final query to get associated document data
  const documents = await Document.scope(
    {
      method: ["withViews", user.id],
    },
    {
      method: ["withCollection", user.id],
    }
  ).findAll({
    where: {
      id: map(results, "id"),
    },
    include: [
      {
        model: User,
        as: "createdBy",
        paranoid: false,
      },
      {
        model: User,
        as: "updatedBy",
        paranoid: false,
      },
    ],
  });
  return {
    results: map(results, (result) => ({
      ranking: result.searchRanking,
      context: removeMarkdown(unescape(result.searchContext), {
        stripHTML: false,
      }),
      document: find(documents, {
        id: result.id,
      }),
    })),
    totalCount: count,
  };
};

// Hooks
// @ts-expect-error ts-migrate(7006) FIXME: Parameter 'model' implicitly has an 'any' type.
Document.addHook("beforeSave", async (model) => {
  if (!model.publishedAt || model.template) {
    return;
  }

  const collection = await Collection.findByPk(model.collectionId);

  if (!collection) {
    return;
  }

  await collection.updateDocument(model);
  model.collection = collection;
});
// @ts-expect-error ts-migrate(7006) FIXME: Parameter 'model' implicitly has an 'any' type.
Document.addHook("afterCreate", async (model) => {
  if (!model.publishedAt || model.template) {
    return;
  }

  const collection = await Collection.findByPk(model.collectionId);

  if (!collection) {
    return;
  }

  await collection.addDocumentToStructure(model, 0);
  model.collection = collection;
  return model;
});

// Instance methods
Document.prototype.toMarkdown = function () {
  const text = unescape(this.text);

  if (this.version) {
    return `# ${this.title}\n\n${text}`;
  }

  return text;
};

Document.prototype.migrateVersion = function () {
  let migrated = false;

  // migrate from document version 0 -> 1
  if (!this.version) {
    // removing the title from the document text attribute
    this.text = this.text.replace(/^#\s(.*)\n/, "");
    this.version = 1;
    migrated = true;
  }

  // migrate from document version 1 -> 2
  if (this.version === 1) {
    const nodes = serializer.deserialize(this.text);
    this.text = serializer.serialize(nodes, {
      version: 2,
    });
    this.version = 2;
    migrated = true;
  }

  if (migrated) {
    return this.save({
      silent: true,
      hooks: false,
    });
  }
};

// Note: This method marks the document and it's children as deleted
// in the database, it does not permanently delete them OR remove
// from the collection structure.
// @ts-expect-error ts-migrate(7006) FIXME: Parameter 'options' implicitly has an 'any' type.
Document.prototype.deleteWithChildren = async function (options) {
  // Helper to destroy all child documents for a document
  // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'documentId' implicitly has an 'any' typ... Remove this comment to see the full error message
  const loopChildren = async (documentId, opts) => {
    const childDocuments = await Document.findAll({
      where: {
        parentDocumentId: documentId,
      },
    });
    // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'child' implicitly has an 'any' type.
    childDocuments.forEach(async (child) => {
      await loopChildren(child.id, opts);
      await child.destroy(opts);
    });
  };

  await loopChildren(this.id, options);
  await this.destroy(options);
};

// @ts-expect-error ts-migrate(7006) FIXME: Parameter 'userId' implicitly has an 'any' type.
Document.prototype.archiveWithChildren = async function (userId, options) {
  const archivedAt = new Date();

  // Helper to archive all child documents for a document
  // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'parentDocumentId' implicitly has an 'an... Remove this comment to see the full error message
  const archiveChildren = async (parentDocumentId) => {
    const childDocuments = await Document.findAll({
      where: {
        parentDocumentId,
      },
    });
    // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'child' implicitly has an 'any' type.
    childDocuments.forEach(async (child) => {
      await archiveChildren(child.id);
      child.archivedAt = archivedAt;
      child.lastModifiedById = userId;
      await child.save(options);
    });
  };

  await archiveChildren(this.id);
  this.archivedAt = archivedAt;
  this.lastModifiedById = userId;
  return this.save(options);
};

// @ts-expect-error ts-migrate(7006) FIXME: Parameter 'options' implicitly has an 'any' type.
Document.prototype.publish = async function (userId: string, options) {
  if (this.publishedAt) return this.save(options);

  if (!this.template) {
    const collection = await Collection.findByPk(this.collectionId);
    await collection.addDocumentToStructure(this, 0);
  }

  this.lastModifiedById = userId;
  this.publishedAt = new Date();
  await this.save(options);
  return this;
};

// @ts-expect-error ts-migrate(7006) FIXME: Parameter 'options' implicitly has an 'any' type.
Document.prototype.unpublish = async function (userId: string, options) {
  if (!this.publishedAt) return this;
  const collection = await this.getCollection();
  await collection.removeDocumentInStructure(this);
  // unpublishing a document converts the "ownership" to yourself, so that it
  // can appear in your drafts rather than the original creators
  this.userId = userId;
  this.lastModifiedById = userId;
  this.publishedAt = null;
  await this.save(options);
  return this;
};

// Moves a document from being visible to the team within a collection
// to the archived area, where it can be subsequently restored.
// @ts-expect-error ts-migrate(7006) FIXME: Parameter 'userId' implicitly has an 'any' type.
Document.prototype.archive = async function (userId) {
  // archive any children and remove from the document structure
  const collection = await this.getCollection();
  await collection.removeDocumentInStructure(this);
  this.collection = collection;
  await this.archiveWithChildren(userId);
  return this;
};

// Restore an archived document back to being visible to the team
Document.prototype.unarchive = async function (userId: string) {
  const collection = await this.getCollection();

  // check to see if the documents parent hasn't been archived also
  // If it has then restore the document to the collection root.
  if (this.parentDocumentId) {
    const parent = await Document.findOne({
      where: {
        id: this.parentDocumentId,
        archivedAt: {
          [Op.eq]: null,
        },
      },
    });
    if (!parent) this.parentDocumentId = null;
  }

  if (!this.template) {
    await collection.addDocumentToStructure(this);
    this.collection = collection;
  }

  if (this.deletedAt) {
    await this.restore();
  }

  this.archivedAt = null;
  this.lastModifiedById = userId;
  await this.save();
  return this;
};

// Delete a document, archived or otherwise.
Document.prototype.delete = function (userId: string) {
  return sequelize.transaction(
    async (transaction: Transaction): Promise<Document> => {
      if (!this.archivedAt && !this.template) {
        // delete any children and remove from the document structure
        const collection = await this.getCollection({
          transaction,
        });
        if (collection)
          await collection.deleteDocument(this, {
            transaction,
          });
      } else {
        await this.destroy({
          transaction,
        });
      }

      await Revision.destroy({
        where: {
          documentId: this.id,
        },
        transaction,
      });
      await this.update(
        {
          lastModifiedById: userId,
        },
        {
          transaction,
        }
      );
      return this;
    }
  );
};

Document.prototype.getTimestamp = function () {
  return Math.round(new Date(this.updatedAt).getTime() / 1000);
};

Document.prototype.getSummary = function () {
  const plain = removeMarkdown(unescape(this.text), {
    stripHTML: false,
  });
  const lines = compact(plain.split("\n"));
  const notEmpty = lines.length >= 1;

  if (this.version) {
    return notEmpty ? lines[0] : "";
  }

  return notEmpty ? lines[1] : "";
};

Document.prototype.toJSON = function () {
  // Warning: only use for new documents as order of children is
  // handled in the collection's documentStructure
  return {
    id: this.id,
    title: this.title,
    url: this.url,
    children: [],
  };
};

export default Document;
