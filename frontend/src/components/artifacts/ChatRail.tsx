/**
 * ChatRail — narrow ChatView wrapper mounted in split-pane focus.
 *
 * Reuses the singleton `getAIStore().pilotSpace` store rather than
 * instantiating a second conversation state. Renders ChatView with
 * `variant="rail"` so secondary UI collapses to the 380px column.
 *
 * See `.planning/phases/86-peek-drawer-split-pane-lineage/86-UI-SPEC.md` §3.
 */
'use client';

import { observer } from 'mobx-react-lite';
import { ChatView } from '@/features/ai/ChatView';
import { getAIStore } from '@/stores/ai/AIStore';

export const ChatRail = observer(function ChatRail() {
  const aiStore = getAIStore();
  const store = aiStore.pilotSpace;

  if (!store) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading chat…
      </div>
    );
  }

  return (
    <ChatView
      store={store}
      approvalStore={aiStore.approval}
      userName="User"
      variant="rail"
      className="h-full"
    />
  );
});
