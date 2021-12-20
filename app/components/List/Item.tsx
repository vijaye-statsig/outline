import * as React from "react";
import styled, { useTheme } from "styled-components";
import Flex from "~/components/Flex";
import NavLink from "~/components/NavLink";

type Props = {
  image?: React.ReactNode;
  to?: string;
  exact?: boolean;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  border?: boolean;
  small?: boolean;
};

const ListItem = (
  { image, title, subtitle, actions, small, border, to, ...rest }: Props,
  ref?: React.Ref<HTMLAnchorElement>
) => {
  const theme = useTheme();
  const compact = !subtitle;

  const content = (selected: boolean) => (
    <>
      {image && <Image>{image}</Image>}
      <Content
        justify={compact ? "center" : undefined}
        column={!compact}
        $selected={selected}
      >
        <Heading $small={small}>{title}</Heading>
        {subtitle && (
          <Subtitle $small={small} $selected={selected}>
            {subtitle}
          </Subtitle>
        )}
      </Content>
      {actions && (
        <Actions $selected={selected} gap={4}>
          {actions}
        </Actions>
      )}
    </>
  );

  if (to) {
    return (
      <Wrapper
        ref={ref}
        $border={border}
        activeStyle={{
          background: theme.primary,
        }}
        {...rest}
        as={NavLink}
        to={to}
      >
        {content}
      </Wrapper>
    );
  }

  return (
    <Wrapper $border={border} {...rest}>
      {content(false)}
    </Wrapper>
  );
};

const Wrapper = styled.div<{ $border?: boolean }>`
  display: flex;
  padding: ${(props) => (props.$border === false ? 0 : "8px 0")};
  margin: ${(props) => (props.$border === false ? "8px 0" : 0)};
  border-bottom: 1px solid
    ${(props) =>
      props.$border === false ? "transparent" : props.theme.divider};

  &:last-child {
    border-bottom: 0;
  }
`;

const Image = styled(Flex)`
  padding: 0 8px 0 0;
  max-height: 32px;
  align-items: center;
  user-select: none;
  flex-shrink: 0;
  align-self: center;
`;

const Heading = styled.p<{ $small?: boolean }>`
  font-size: ${(props) => (props.$small ? 14 : 16)}px;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  line-height: ${(props) => (props.$small ? 1.3 : 1.2)};
  margin: 0;
`;

const Content = styled(Flex)<{ $selected: boolean }>`
  flex-direction: column;
  flex-grow: 1;
  color: ${(props) => (props.$selected ? props.theme.white : props.theme.text)};
`;

const Subtitle = styled.p<{ $small?: boolean; $selected?: boolean }>`
  margin: 0;
  font-size: ${(props) => (props.$small ? 13 : 14)}px;
  color: ${(props) =>
    props.$selected ? props.theme.white50 : props.theme.textTertiary};
  margin-top: -2px;
`;

export const Actions = styled(Flex)<{ $selected?: boolean }>`
  align-self: center;
  justify-content: center;
  color: ${(props) =>
    props.$selected ? props.theme.white : props.theme.textSecondary};
`;

export default React.forwardRef(ListItem);
