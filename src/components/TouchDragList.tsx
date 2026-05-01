'use client';

import { useState, useRef, useCallback } from 'react';

interface Props<T extends { id: string }> {
  items: T[];
  onReorder: (items: T[]) => void;
  renderItem: (item: T, index: number, dragHandleProps: DragHandleProps) => React.ReactNode;
}

export interface DragHandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
}

export default function TouchDragList<T extends { id: string }>({ items, onReorder, renderItem }: Props<T>) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const itemHeight = useRef(0);

  const handlePointerDown = useCallback((idx: number, e: React.PointerEvent) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    const row = target.closest('[data-drag-item]') as HTMLElement;
    if (!row) return;

    itemHeight.current = row.offsetHeight;
    startY.current = e.clientY;
    setDragIdx(idx);
    setOverIdx(idx);

    const handleMove = (ev: PointerEvent) => {
      const delta = ev.clientY - startY.current;
      const shift = Math.round(delta / itemHeight.current);
      const newOver = Math.max(0, Math.min(items.length - 1, idx + shift));
      setOverIdx(newOver);
    };

    const handleUp = () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);

      setDragIdx(null);
      setOverIdx(null);

      if (overIdx !== null && overIdx !== idx) {
        const arr = [...items];
        const [moved] = arr.splice(idx, 1);
        arr.splice(overIdx, 0, moved);
        onReorder(arr);
      }
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  }, [items, onReorder, overIdx]);

  const getDisplayItems = () => {
    if (dragIdx === null || overIdx === null || dragIdx === overIdx) return items;
    const arr = [...items];
    const [moved] = arr.splice(dragIdx, 1);
    arr.splice(overIdx, 0, moved);
    return arr;
  };

  const displayItems = getDisplayItems();

  return (
    <div ref={containerRef} style={{ touchAction: dragIdx !== null ? 'none' : 'auto' }}>
      {displayItems.map((item, i) => (
        <div key={item.id} data-drag-item style={{
          opacity: dragIdx !== null && items[dragIdx]?.id === item.id ? 0.5 : 1,
          transition: dragIdx !== null ? 'none' : 'opacity 0.15s',
        }}>
          {renderItem(item, i, {
            onPointerDown: (e: React.PointerEvent) => handlePointerDown(items.findIndex(x => x.id === item.id), e),
          })}
        </div>
      ))}
    </div>
  );
}
