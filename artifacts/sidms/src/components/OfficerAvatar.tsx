import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";

interface OfficerAvatarProps {
  name: string;
  avatarUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
  testId?: string;
}

export default function OfficerAvatar({
  name,
  avatarUrl,
  className,
  fallbackClassName,
  testId,
}: OfficerAvatarProps) {
  return (
    <Avatar
      className={cn("w-7 h-7 border border-[#253650]", className)}
      data-testid={testId}
    >
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback
        className={cn(
          "bg-[#1a2744] text-gray-400 text-[10px] font-semibold",
          fallbackClassName
        )}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
