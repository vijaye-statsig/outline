import fetch from "fetch-with-proxy";
import { Op } from "sequelize";
import { Document, Integration, Collection, Team } from "@server/models";
import { presentSlackAttachment } from "@server/presenters";
import {
  DocumentEvent,
  IntegrationEvent,
  RevisionEvent,
  Event,
} from "../../types";

export default class SlackProcessor {
  async on(event: Event) {
    switch (event.name) {
      case "documents.publish":
      case "revisions.create":
        return this.documentUpdated(event);

      case "integrations.create":
        return this.integrationCreated(event);

      default:
    }
  }

  async integrationCreated(event: IntegrationEvent) {
    const integration = await Integration.findOne({
      where: {
        id: event.modelId,
        service: "slack",
        type: "post",
      },
      include: [
        {
          model: Collection,
          required: true,
          as: "collection",
        },
      ],
    });
    if (!integration) return;

    const collection = integration.collection;
    if (!collection) return;

    await fetch(integration.settings.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: `👋 Hey there! When documents are published or updated in the *${collection.name}* collection on Outline they will be posted to this channel!`,
        attachments: [
          {
            color: collection.color,
            title: collection.name,
            title_link: `${process.env.URL}${collection.url}`,
            text: collection.description,
          },
        ],
      }),
    });
  }

  async documentUpdated(event: DocumentEvent | RevisionEvent) {
    // never send notifications when batch importing documents
    // @ts-expect-error ts-migrate(2339) FIXME: Property 'data' does not exist on type 'DocumentEv... Remove this comment to see the full error message
    if (event.data && event.data.source === "import") return;
    const [document, team] = await Promise.all([
      Document.findByPk(event.documentId),
      Team.findByPk(event.teamId),
    ]);
    if (!document) return;

    // never send notifications for draft documents
    if (!document.publishedAt) return;

    const integration = await Integration.findOne({
      where: {
        teamId: document.teamId,
        collectionId: document.collectionId,
        service: "slack",
        type: "post",
        events: {
          [Op.contains]: [event.name],
        },
      },
    });
    if (!integration) return;
    let text = `${document.updatedBy.name} updated a document`;

    if (event.name === "documents.publish") {
      text = `${document.createdBy.name} published a new document`;
    }

    await fetch(integration.settings.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        attachments: [
          presentSlackAttachment(document, document.collection, team),
        ],
      }),
    });
  }
}
