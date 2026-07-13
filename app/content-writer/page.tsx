"use client";

import { useMemo, useState } from "react";
import { assets, hospitals } from "@/lib/subscription-data";

const channelOptions = ["인스타그램 캡션", "블로그 글 초안", "네이버 플레이스 소식", "카카오채널 메시지", "릴스 자막", "홈페이지 섹션 문구"];
const topicOptions = ["촬영 비하인드", "원장 프로필 소개", "공간/인테리어 소개", "장비 & 시술 소개", "납품 결과물 안내", "시즌 이벤트", "의료진 인터뷰", "계절성 건강정보"];
const toneOptions = ["전문적인", "따뜻한", "친근한", "프리미엄한", "검색 최적화형"];

export default function ContentWriterPage() {
  const [hospitalId, setHospitalId] = useState(hospitals[0].id);
  const [assetId, setAssetId] = useState(assets[0].id);
  const [channel, setChannel] = useState(channelOptions[1]);
  const [topic, setTopic] = useState(topicOptions[1]);
  const [tone, setTone] = useState(toneOptions[0]);
  const [memo, setMemo] = useState("처음 상담을 앞둔 환자가 안심할 수 있는 문장으로 작성");
  const hospital = hospitals.find((item) => item.id === hospitalId) || hospitals[0];
  const hospitalAssets = assets.filter((asset) => asset.hospitalId === hospitalId);
  const selectedAsset = useMemo(() => assets.find((asset) => asset.id === assetId) || hospitalAssets[0] || assets[0], [assetId, hospitalAssets]);
  const riskWords = ["완치", "100%", "최고", "무조건", "전후사진", "체험담"];

  return (
    <main className="ops-shell">
      <header className="ops-header">
        <p>Content Writer</p>
        <h1>납품 콘텐츠 초안 생성</h1>
        <span>촬영한 병원 사진을 바탕으로 클라이언트에게 납품할 채널별 콘텐츠를 만들고 의료광고 리스크를 점검합니다.</span>
      </header>
      <section className="ops-two-column">
        <aside className="ops-panel">
          <h2>납품 정보 입력</h2>
          <label className="field"><span>클라이언트</span><select value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}>{hospitals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="field"><span>납품 사진</span><select value={assetId} onChange={(e) => setAssetId(e.target.value)}>{hospitalAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}</select></label>
          <label className="field"><span>납품 채널</span><select value={channel} onChange={(e) => setChannel(e.target.value)}>{channelOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field"><span>콘텐츠 주제</span><select value={topic} onChange={(e) => setTopic(e.target.value)}>{topicOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field"><span>톤앤매너</span><select value={tone} onChange={(e) => setTone(e.target.value)}>{toneOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field"><span>작업 메모</span><textarea value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
        </aside>
        <section className="ops-panel">
          <h2>납품 콘텐츠 초안</h2>
          <img className="writer-thumb" src={selectedAsset.fileUrl} alt="" />
          <div className="ops-list">
            <div><strong>제목 후보</strong><span>{hospital.name} — {topic} 콘텐츠 납품</span></div>
            <div><strong>본문 초안</strong><span>{topic}을 주제로 {tone} 톤의 {channel} 콘텐츠를 구성합니다. {memo}</span></div>
            <div><strong>짧은 요약문</strong><span>포토클리닉이 촬영한 사진을 활용하여 브랜드 신뢰도를 높이는 콘텐츠를 제작합니다.</span></div>
            <div><strong>CTA</strong><span>{hospital.name} 인스타그램/블로그에 업로드하기 위한 초안입니다.</span></div>
            <div><strong>해시태그</strong><span>#병원브랜딩 #병원사진 #포토클리닉 #{hospital.name}</span></div>
          </div>
          <div className="risk-box">
            <strong>의료광고 표현 리스크 체크</strong>
            {riskWords.map((word) => <span key={word}>{word} 표현 주의</span>)}
          </div>
        </section>
      </section>
    </main>
  );
}
