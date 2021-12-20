import {
  Attachment,
  Team,
  User,
  Collection,
  Document,
  Group,
} from "@server/models";
import policy from "./policy";
import "./apiKey";
import "./attachment";
import "./authenticationProvider";
import "./collection";
import "./document";
import "./integration";
import "./notificationSetting";
import "./searchQuery";
import "./share";
import "./user";
import "./team";
import "./group";

const { can, abilities } = policy;
type Policy = Record<string, boolean>;

/*
 * Given a user and a model – output an object which describes the actions the
 * user may take against the model. This serialized policy is used for testing
 * and sent in API responses to allow clients to adjust which UI is displayed.
 */
export function serialize(
  // @ts-expect-error ts-migrate(2749) FIXME: 'User' refers to a value, but is being used as a t... Remove this comment to see the full error message
  model: User,
  // @ts-expect-error ts-migrate(2749) FIXME: 'Attachment' refers to a value, but is being used ... Remove this comment to see the full error message
  target: Attachment | Team | Collection | Document | Group
): Policy {
  const output = {};
  abilities.forEach((ability) => {
    if (model instanceof ability.model && target instanceof ability.target) {
      let response = true;

      try {
        response = can(model, ability.action, target);
      } catch (err) {
        response = false;
      }

      output[ability.action] = response;
    }
  });
  return output;
}

export default policy;
