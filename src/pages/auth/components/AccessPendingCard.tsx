import Button from "../../shared/components/ui/Button";
import {
  PocketOptionIcon,
  TelegramIcon,
  SecurityIcon,
  NotificationIcon,
  BitcoinIcon,
} from "../../shared/components/icons";
import { usePublicI18n } from "../../shared/publicI18n";

interface AccessPendingCardProps {
  poId: string;
  checkingStatus: boolean;
  onCopyId: () => void;
  onCheckStatus: () => void;
  onLogout: () => void;
  pocketOptionLink: string;
  helpLink: string;
}

const compactButtonStyle = {
  height: 40,
  paddingLeft: 14,
  paddingRight: 14,
};

function StepBadge({ done, index }: { done?: boolean; index?: number }) {
  if (done) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[1rem] border border-emerald-400/20 bg-emerald-500/15 text-emerald-300 sm:h-10 sm:w-10 sm:rounded-[1.125rem]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12.5L9.5 17L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[1rem] border border-white/[0.08] bg-white/[0.03] text-[12px] font-semibold text-white/70 sm:h-10 sm:w-10 sm:rounded-[1.125rem] sm:text-[13px]">
      {index}
    </div>
  );
}

function StepRow({
  icon,
  title,
  description,
  done,
  index,
  action,
  emphasized = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  done?: boolean;
  index?: number;
  action?: React.ReactNode;
  emphasized?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-center gap-3 rounded-[1.375rem] border px-3 py-3 sm:gap-4 sm:rounded-[1.5rem] sm:px-4 sm:py-3.5",
        done
          ? "border-emerald-400/25 bg-emerald-500/10"
          : emphasized
            ? "border-amber-300/20 bg-amber-500/5"
            : "border-white/[0.08] bg-white/[0.02]",
      ].join(" ")}
    >
      <StepBadge done={done} index={index} />
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[1rem] bg-white/[0.04] text-white/65 sm:h-10 sm:w-10 sm:rounded-[1.125rem]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold leading-4 text-white sm:text-[14px]">{title}</div>
        <div className="mt-1 text-[11px] leading-4 text-[#9CA3AF] sm:text-[12px] sm:leading-[1.1rem]">{description}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export default function AccessPendingCard({
  poId,
  checkingStatus,
  onCopyId,
  onCheckStatus,
  onLogout,
  pocketOptionLink,
  helpLink,
}: AccessPendingCardProps) {
  const { publicT } = usePublicI18n();

  return (
    <div className="flex w-full flex-1 items-start justify-center px-3 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-4 sm:py-6 lg:items-center">
      <div className="w-full max-w-[760px]">
        <div className="rounded-[22px] border border-amber-300/10 bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.16),_rgba(23,23,23,0.96)_36%,_rgba(23,23,23,0.98)_70%)] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.38)] sm:rounded-[26px] sm:p-6">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[18px] border border-amber-300/20 bg-amber-400/10 text-amber-300 sm:mb-5 sm:h-14 sm:w-14 sm:rounded-[20px]">
            <SecurityIcon size={22} />
          </div>

          <p className="mx-auto max-w-[520px] text-center text-[12px] leading-5 text-[#BABDC3] sm:text-[13px] sm:leading-6">
            {publicT.auth.accessPending.description}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:flex sm:justify-center sm:gap-3">
            <Button
              type="button"
              onClick={onCheckStatus}
              loading={checkingStatus}
              className="text-[11px] sm:text-[13px]"
              style={compactButtonStyle}
            >
              {publicT.auth.accessPending.checkStatus}
            </Button>
            <Button
              href={helpLink}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
              leftIcon={<TelegramIcon size={15} />}
              className="text-[11px] sm:text-[13px]"
              style={compactButtonStyle}
            >
              {publicT.auth.accessPending.needHelp}
            </Button>
          </div>

          <div className="mt-5 rounded-[18px] border border-white/[0.08] bg-card/80 p-4 sm:mt-6 sm:rounded-[22px] sm:p-5">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35 sm:text-[11px]">
              {publicT.auth.accessPending.yourPocketId}
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-[1.25rem] font-bold leading-none tracking-[0.05em] text-white sm:text-[1.5rem]">{poId}</div>
              <Button
                type="button"
                variant="dark"
                onClick={onCopyId}
                className="shrink-0 text-[11px] sm:text-[13px]"
                style={compactButtonStyle}
              >
                {publicT.auth.accessPending.copy}
              </Button>
            </div>
          </div>

          <div className="mt-5 rounded-[18px] border border-white/[0.08] bg-card/80 p-4 sm:mt-6 sm:rounded-[22px] sm:p-5">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35 sm:mb-4 sm:text-[11px]">
              {publicT.auth.accessPending.accessFlow}
            </div>

            <div className="space-y-2.5 sm:space-y-3">
              <StepRow
                done
                icon={<PocketOptionIcon size={16} />}
                title={publicT.auth.accessPending.stepRegisterTitle}
                description={publicT.auth.accessPending.stepRegisterDescription}
              />

              <StepRow
                done
                icon={<NotificationIcon size={16} />}
                title={publicT.auth.accessPending.stepConfirmedTitle}
                description={publicT.auth.accessPending.stepConfirmedDescription}
              />

              <StepRow
                index={3}
                emphasized
                icon={<BitcoinIcon size={16} />}
                title={publicT.auth.accessPending.stepDepositTitle}
                description={publicT.auth.accessPending.stepDepositDescription}
                action={
                  <Button
                    href={pocketOptionLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] sm:text-[13px]"
                    style={compactButtonStyle}
                  >
                    {publicT.auth.accessPending.deposit}
                  </Button>
                }
              />
            </div>
          </div>

          <div className="mt-4 sm:mt-5 sm:flex sm:justify-center">
            <Button
              type="button"
              variant="dark"
              onClick={onLogout}
              className="text-[11px] sm:text-[13px]"
              style={compactButtonStyle}
            >
              {publicT.auth.accessPending.logout}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}