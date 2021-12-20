import { Revision } from "@server/models";
import { buildDocument } from "@server/test/factories";
import { flushdb } from "@server/test/support";
import RevisionsService from "./revisions";

const Revisions = new RevisionsService();
beforeEach(() => flushdb());
beforeEach(jest.resetAllMocks);

describe("documents.update.debounced", () => {
  test("should create a revision", async () => {
    const document = await buildDocument();
    // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '{ name: "documents.update.deboun... Remove this comment to see the full error message
    await Revisions.on({
      name: "documents.update.debounced",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
    });
    const amount = await Revision.count({
      where: {
        documentId: document.id,
      },
    });
    expect(amount).toBe(1);
  });

  test("should not create a revision if identical to previous", async () => {
    const document = await buildDocument();
    await Revision.createFromDocument(document);
    // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '{ name: "documents.update.deboun... Remove this comment to see the full error message
    await Revisions.on({
      name: "documents.update.debounced",
      documentId: document.id,
      collectionId: document.collectionId,
      teamId: document.teamId,
      actorId: document.createdById,
    });
    const amount = await Revision.count({
      where: {
        documentId: document.id,
      },
    });
    expect(amount).toBe(1);
  });
});
