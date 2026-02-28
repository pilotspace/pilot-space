import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading skeleton for conversation resume with staggered animation.
 * Shown while ChatView is resuming a prior session.
 */
export function ConversationLoadingSkeleton() {
  const messageSkeletons = [
    // User message
    {
      align: 'end',
      items: [
        { h: 4, w: 48 },
        { h: 12, w: 64 },
      ],
    },
    // Assistant message
    {
      align: 'start',
      items: [
        { h: 4, w: 32 },
        { h: 20, w: 80 },
        { h: 16, w: 72 },
      ],
    },
    // User message
    {
      align: 'end',
      items: [
        { h: 4, w: 40 },
        { h: 10, w: 56 },
      ],
    },
    // Assistant message
    {
      align: 'start',
      items: [
        { h: 4, w: 36 },
        { h: 24, w: 96 },
      ],
    },
  ];

  return (
    <motion.div
      role="status"
      aria-label="Loading conversation"
      className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {messageSkeletons.map((msg, idx) => (
        <motion.div
          key={idx}
          className={cn('flex', msg.align === 'end' ? 'justify-end' : 'justify-start')}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.1, duration: 0.3 }}
        >
          <div className="max-w-[80%] space-y-2">
            {msg.items.map((item, itemIdx) => (
              <Skeleton
                key={itemIdx}
                className={cn(
                  `h-${item.h} w-${item.w} rounded-xl`,
                  msg.align === 'end' && itemIdx === 0 && 'ml-auto'
                )}
                style={{ height: item.h * 4, width: item.w * 4 }}
              />
            ))}
          </div>
        </motion.div>
      ))}

      {/* Loading indicator at bottom */}
      <motion.div
        className="flex justify-center pt-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <motion.div
            className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 0.2 }}
          />
          <motion.div
            className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 0.2, delay: 0.2 }}
          />
          <motion.div
            className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 0.2, delay: 0.4 }}
          />
          <span className="ml-1">Loading conversation</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
