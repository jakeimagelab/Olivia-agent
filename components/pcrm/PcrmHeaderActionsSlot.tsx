"use client";

import { createContext, useContext, useEffect, useState, type DependencyList, type ReactNode } from "react";

type SlotContextValue = { actions: ReactNode; setActions: (node: ReactNode) => void };

const PcrmHeaderActionsContext = createContext<SlotContextValue | null>(null);

// GlobalHeader는 layout.tsx가 그리고, 검색어 같은 실제 상태는 그 아래 page.tsx가 갖고 있다 —
// 이 컨텍스트가 그 사이를 잇는 슬롯이다. page.tsx가 usePcrmHeaderActions로 꽂아 넣은 내용을
// layout.tsx 쪽이 usePcrmHeaderActionsSlot으로 읽어서 GlobalHeader의 pageActions로 전달한다.
export function PcrmHeaderActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null);
  return (
    <PcrmHeaderActionsContext.Provider value={{ actions, setActions }}>
      {children}
    </PcrmHeaderActionsContext.Provider>
  );
}

export function usePcrmHeaderActionsSlot(): ReactNode {
  return useContext(PcrmHeaderActionsContext)?.actions ?? null;
}

// node는 호출부에서 useMemo로 감싸서 넘겨야 한다 — 매 렌더마다 새 JSX를 그대로 넘기면
// deps가 매번 바뀐 것으로 보여 setActions가 계속 불리고, 그게 다시 이 컴포넌트를 리렌더시켜
// 무한 루프가 된다. deps는 useEffect와 동일하게 실제로 이 node가 의존하는 값만 넣는다.
export function usePcrmHeaderActions(node: ReactNode, deps: DependencyList) {
  const ctx = useContext(PcrmHeaderActionsContext);
  const setActions = ctx?.setActions;
  useEffect(() => {
    setActions?.(node);
    return () => setActions?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
