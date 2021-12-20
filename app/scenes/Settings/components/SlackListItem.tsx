import { uniq } from "lodash";
import { observer } from "mobx-react";
import * as React from "react";
import { Trans, useTranslation } from "react-i18next";
import { usePopoverState, PopoverDisclosure } from "reakit/Popover";
import styled from "styled-components";
import Collection from "~/models/Collection";
import Integration from "~/models/Integration";
import Button from "~/components/Button";
import ButtonLink from "~/components/ButtonLink";
import CollectionIcon from "~/components/CollectionIcon";
import Flex from "~/components/Flex";
import HelpText from "~/components/HelpText";
import ListItem from "~/components/List/Item";
import Popover from "~/components/Popover";
import Toggle from "~/components/Toggle";
import useToasts from "~/hooks/useToasts";

type Props = {
  integration: Integration;
  collection: Collection;
};

function SlackListItem({ integration, collection }: Props) {
  const { t } = useTranslation();
  const { showToast } = useToasts();

  const handleChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    if (ev.target.checked) {
      integration.events = uniq([...integration.events, ev.target.name]);
    } else {
      integration.events = integration.events.filter(
        (n) => n !== ev.target.name
      );
    }

    await integration.save();

    showToast(t("Settings saved"), {
      type: "success",
    });
  };

  const mapping = {
    "documents.publish": t("document published"),
    "documents.update": t("document updated"),
  };

  const popover = usePopoverState({
    gutter: 0,
    placement: "bottom-start",
  });

  return (
    <ListItem
      key={integration.id}
      title={
        <Flex align="center" gap={6}>
          <CollectionIcon collection={collection} /> {collection.name}
        </Flex>
      }
      subtitle={
        <>
          <Trans
            defaults={`Posting to the <em>{{ channelName }}</em> channel on`}
            values={{
              channelName: integration.settings.channel,
              events: integration.events.map((ev) => mapping[ev]).join(", "),
            }}
            components={{
              em: <strong />,
            }}
          />{" "}
          <PopoverDisclosure {...popover}>
            {(props) => (
              <ButtonLink {...props}>
                {integration.events.map((ev) => mapping[ev]).join(", ")}
              </ButtonLink>
            )}
          </PopoverDisclosure>
          <Popover {...popover} aria-label={t("Settings")}>
            <Events>
              <h3>{t("Notifications")}</h3>
              <HelpText>{t("These events should be posted to Slack")}</HelpText>
              <Toggle
                label={t("Document published")}
                name="documents.publish"
                checked={integration.events.includes("documents.publish")}
                onChange={handleChange}
              />
              <Toggle
                label={t("Document updated")}
                name="documents.update"
                checked={integration.events.includes("documents.update")}
                onChange={handleChange}
              />
            </Events>
          </Popover>
        </>
      }
      actions={
        <Button onClick={integration.delete} neutral>
          {t("Disconnect")}
        </Button>
      }
    />
  );
}

const Events = styled.div`
  color: ${(props) => props.theme.text};
  margin-top: -12px;
`;

export default observer(SlackListItem);
