import passport from "@outlinewiki/koa-passport";
import Router from "koa-router";
// @ts-expect-error ts-migrate(7016) FIXME: Could not find a declaration file for module 'pass... Remove this comment to see the full error message
import { Strategy as SlackStrategy } from "passport-slack-oauth2";
import accountProvisioner from "@server/commands/accountProvisioner";
import env from "@server/env";
import auth from "@server/middlewares/authentication";
import passportMiddleware from "@server/middlewares/passport";
import {
  IntegrationAuthentication,
  Collection,
  Integration,
  Team,
} from "@server/models";
import { StateStore } from "@server/utils/passport";
import * as Slack from "@server/utils/slack";
import { assertPresent, assertUuid } from "@server/validation";

const router = new Router();
const providerName = "slack";
const SLACK_CLIENT_ID = process.env.SLACK_KEY;
const SLACK_CLIENT_SECRET = process.env.SLACK_SECRET;
const scopes = [
  "identity.email",
  "identity.basic",
  "identity.avatar",
  "identity.team",
];

export const config = {
  name: "Slack",
  enabled: !!SLACK_CLIENT_ID,
};

if (SLACK_CLIENT_ID) {
  const strategy = new SlackStrategy(
    {
      clientID: SLACK_CLIENT_ID,
      clientSecret: SLACK_CLIENT_SECRET,
      callbackURL: `${env.URL}/auth/slack.callback`,
      passReqToCallback: true,
      store: new StateStore(),
      scope: scopes,
    },
    // @ts-expect-error ts-migrate(7006) FIXME: Parameter 'req' implicitly has an 'any' type.
    async function (req, accessToken, refreshToken, profile, done) {
      try {
        const result = await accountProvisioner({
          ip: req.ip,
          team: {
            name: profile.team.name,
            subdomain: profile.team.domain,
            avatarUrl: profile.team.image_230,
          },
          user: {
            name: profile.user.name,
            email: profile.user.email,
            avatarUrl: profile.user.image_192,
          },
          authenticationProvider: {
            name: providerName,
            providerId: profile.team.id,
          },
          authentication: {
            providerId: profile.user.id,
            accessToken,
            refreshToken,
            scopes,
          },
        });
        return done(null, result.user, result);
      } catch (err) {
        return done(err, null);
      }
    }
  );
  // For some reason the author made the strategy name capatilised, I don't know
  // why but we need everything lowercase so we just monkey-patch it here.
  strategy.name = providerName;
  passport.use(strategy);

  router.get("slack", passport.authenticate(providerName));

  router.get("slack.callback", passportMiddleware(providerName));

  router.get(
    "slack.commands",
    auth({
      required: false,
    }),
    async (ctx) => {
      const { code, state, error } = ctx.request.query;
      const user = ctx.state.user;
      assertPresent(code || error, "code is required");

      if (error) {
        ctx.redirect(`/settings/integrations/slack?error=${error}`);
        return;
      }

      // this code block accounts for the root domain being unable to
      // access authentication for subdomains. We must forward to the appropriate
      // subdomain to complete the oauth flow
      if (!user) {
        if (state) {
          try {
            const team = await Team.findByPk(state);
            return ctx.redirect(
              `${team.url}/auth${ctx.request.path}?${ctx.request.querystring}`
            );
          } catch (err) {
            return ctx.redirect(
              `/settings/integrations/slack?error=unauthenticated`
            );
          }
        } else {
          return ctx.redirect(
            `/settings/integrations/slack?error=unauthenticated`
          );
        }
      }

      const endpoint = `${process.env.URL || ""}/auth/slack.commands`;
      // @ts-expect-error ts-migrate(2345) FIXME: Argument of type 'string | string[] | undefined' i... Remove this comment to see the full error message
      const data = await Slack.oauthAccess(code, endpoint);
      const authentication = await IntegrationAuthentication.create({
        service: "slack",
        userId: user.id,
        teamId: user.teamId,
        token: data.access_token,
        scopes: data.scope.split(","),
      });
      await Integration.create({
        service: "slack",
        type: "command",
        userId: user.id,
        teamId: user.teamId,
        authenticationId: authentication.id,
        settings: {
          serviceTeamId: data.team_id,
        },
      });
      ctx.redirect("/settings/integrations/slack");
    }
  );

  router.get(
    "slack.post",
    auth({
      required: false,
    }),
    async (ctx) => {
      const { code, error, state } = ctx.request.query;
      const user = ctx.state.user;
      assertPresent(code || error, "code is required");

      const collectionId = state;
      assertUuid(collectionId, "collectionId must be an uuid");

      if (error) {
        ctx.redirect(`/settings/integrations/slack?error=${error}`);
        return;
      }

      // this code block accounts for the root domain being unable to
      // access authentication for subdomains. We must forward to the
      // appropriate subdomain to complete the oauth flow
      if (!user) {
        try {
          const collection = await Collection.findByPk(state);
          const team = await Team.findByPk(collection.teamId);
          return ctx.redirect(
            `${team.url}/auth${ctx.request.path}?${ctx.request.querystring}`
          );
        } catch (err) {
          return ctx.redirect(
            `/settings/integrations/slack?error=unauthenticated`
          );
        }
      }

      const endpoint = `${process.env.URL || ""}/auth/slack.post`;
      const data = await Slack.oauthAccess(code as string, endpoint);
      const authentication = await IntegrationAuthentication.create({
        service: "slack",
        userId: user.id,
        teamId: user.teamId,
        token: data.access_token,
        scopes: data.scope.split(","),
      });

      await Integration.create({
        service: "slack",
        type: "post",
        userId: user.id,
        teamId: user.teamId,
        authenticationId: authentication.id,
        collectionId,
        events: ["documents.update", "documents.publish"],
        settings: {
          url: data.incoming_webhook.url,
          channel: data.incoming_webhook.channel,
          channelId: data.incoming_webhook.channel_id,
        },
      });
      ctx.redirect("/settings/integrations/slack");
    }
  );
}

export default router;
