/** Public-facing channel entry from the gateway (no secrets). */
export type TenantChannelEntry = {
  id: string;
  channelType: "telegram";
  label: string | null;
  status: "active" | "inactive" | "error";
  lastError: string | null;
  botInfo: {
    id: number;
    username: string | null;
    first_name?: string | null;
  } | null;
  createdAt: string;
};

/** Telegram setup wizard state. */
export type TelegramSetupState = {
  step: 1 | 2 | 3;
  botToken: string;
  botInfo: {
    id?: number;
    username?: string | null;
    first_name?: string | null;
  } | null;
  error: string | null;
  loading: boolean;
};

/** Props for the tenant channels view. */
export type TenantChannelsProps = {
  channels: TenantChannelEntry[];
  loading: boolean;
  wizardOpen: boolean;
  wizardState: TelegramSetupState | null;
  onOpenWizard: () => void;
  onCloseWizard: () => void;
  onWizardTokenInput: (token: string) => void;
  onWizardVerify: () => void;
  onWizardConnect: () => void;
  onWizardBack: () => void;
  onRemoveChannel: (channelId: string) => void;
};
