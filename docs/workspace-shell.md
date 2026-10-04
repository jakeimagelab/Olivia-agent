# 작업실 공통 셸

사진작업실과 영상작업실은 `components/workspace-shell/`의 공통 부품으로 같은 창 구조를 유지한다.

## 기본 구조

```tsx
<WorkspaceShell>
  <ExecutionBar visible={needsExecutionLocation} />
  <WorkspaceContent>
    <WorkspaceTabs items={sections} value={section} onChange={setSection} />
    <WorkspaceGrid guide={<GuidePanel steps={guideSteps} />}>
      <WorkPanel tone="light">
        <WorkspaceSubTabs items={tools} value={tool} onChange={setTool} />
        <ToolWorkspace />
      </WorkPanel>
    </WorkspaceGrid>
  </WorkspaceContent>
</WorkspaceShell>
```

## 사용 규칙

- 상위 단계는 `WorkspaceTabs`, 한 단계 안의 도구는 `WorkspaceSubTabs`를 쓴다. 세부 도구가 하나면 세부 탭을 생략한다.
- 쓰기 중심 화면은 `WorkPanel tone="light"`, 사진·영상 판단 화면은 `tone="dark"`를 쓴다.
- 작업 위치가 필요한 도구에서만 `ExecutionBar`를 표시한다.
- 단계형 흐름은 `Stepper`를 사용하며 기존 기능의 단계 수와 순서는 바꾸지 않는다.
- 오른쪽 안내는 `GuidePanel`의 번호 단계와 TIP으로 구성한다. `WorkspaceGrid`는 900px 미만에서 안내 접기 버튼을 제공한다.
- 작업실에 포함된 Workspace는 자체 `GlobalHeader`를 렌더하지 않는다. 독립 공유 페이지의 헤더와 토큰 경로는 별도로 유지한다.
- 탭 전환은 `?tab=&tool=`과 동기화해 새로고침·뒤로가기·Olivia 명령이 같은 위치를 연다.
- 탭과 버튼에는 `lucide-react` 선 아이콘과 공통 디자인 토큰을 사용한다. 탭 라벨에는 이모지를 쓰지 않는다.

## 새 기능 추가

1. 기능 본문을 route `page.tsx`에서 재사용 가능한 Workspace 컴포넌트로 분리한다.
2. 작업실의 상위 단계와 세부 도구 목록에 등록하고 canonical `?tab=&tool=` 주소를 정한다.
3. 필요한 톤과 실행 위치를 지정하고 `GuidePanel` 안내를 추가한다.
4. 옛 내부 주소는 canonical 주소로 연결하되 외부 공유·토큰 주소는 독립 화면으로 보존한다.
5. 넓은 폭과 900px 미만에서 패널, 안내, 입력 영역의 잘림과 중복 헤더를 확인한다.
