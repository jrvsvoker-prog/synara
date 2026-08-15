// FILE: ChatEmptyStateHero.tsx
// Purpose: Render the resting state for a transcript that has no messages yet.
// Layer: Chat presentation
// Depends on: the caller-supplied project display name.

/**
 * An empty transcript is an empty canvas: the composer below it is the thing to act on,
 * so this surface stays quiet. It used to center a 40px wordmark under a 24px "Let's
 * build" headline, which turned a resting state into a splash screen and made the
 * transcript read as a destination rather than as space waiting for the conversation.
 *
 * Only the working context survives, and only when there is one to name — a single muted
 * line that tells you which project the next message lands in.
 */
export const ChatEmptyStateHero = function ChatEmptyStateHero({
  projectName,
}: {
  projectName: string | undefined;
}) {
  if (!projectName) {
    return null;
  }

  return (
    <div className="flex flex-col items-center select-none">
      <span className="text-[length:var(--app-font-size-ui-sm,12px)] text-muted-foreground/55">
        {projectName}
      </span>
    </div>
  );
};
