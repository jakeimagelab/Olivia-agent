"use client";

import { useMemo, useState } from "react";
import { assets, hospitals } from "@/lib/subscription-data";

const channels = ["인스타그램 피드", "인스타그램 스토리", "릴스 썸네일", "블로그 대표 이미지", "네이버 플레이스 소식 이미지", "홈페이지 배너"];
const purposes = ["원장 소개", "진료 안내", "이벤트 안내", "병원 소식", "장비 소개", "공간 소개", "후기/신뢰 콘텐츠"];
const tones = ["따뜻한", "프리미엄한", "신뢰감 있는", "밝고 화사한", "차분한", "감성적인"];
const templates = ["큰 사진 + 하단 타이틀", "좌측 사진 + 우측 문구", "배경 사진 + 어두운 그라디언트", "원장 프로필 카드", "병원 소식 카드", "이벤트 카드"];

export default function SnsDesignPage() {
  const [hospitalId, setHospitalId] = useState(hospitals[0].id);
  const [assetId, setAssetId] = useState(assets[0].id);
  const [channel, setChannel] = useState(channels[0]);
  const [purpose, setPurpose] = useState(purposes[0]);
  const [tone, setTone] = useState(tones[0]);
  const [template, setTemplate] = useState(templates[0]);
  const [text, setText] = useState("환자의 마음까지 생각하는 상담");

  const hospital = hospitals.find((item) => item.id === hospitalId) || hospitals[0];
  const hospitalAssets = assets.filter((asset) => asset.hospitalId === hospitalId);
  const selectedAsset = useMemo(() => assets.find((asset) => asset.id === assetId) || hospitalAssets[0] || assets[0], [assetId, hospitalAssets]);

  return (
    <main className="ops-shell">
      <header className="ops-header">
        <p>SNS Design</p>
        <h1>SNS 디자인 생성</h1>
        <span>촬영 사진을 선택해 구독 병원의 SNS 이미지와 릴스 썸네일을 카드형 템플릿으로 만듭니다.</span>
      </header>
      <section className="design-workspace">
        <aside className="ops-panel">
          <h2>디자인 설정</h2>
          <label className="field"><span>병원</span><select value={hospitalId} onChange={(e) => { setHospitalId(e.target.value); setAssetId(assets.find((asset) => asset.hospitalId === e.target.value)?.id || assets[0].id); }}>{hospitals.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="field"><span>사진</span><select value={assetId} onChange={(e) => setAssetId(e.target.value)}>{hospitalAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.title}</option>)}</select></label>
          <label className="field"><span>채널</span><select value={channel} onChange={(e) => setChannel(e.target.value)}>{channels.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field"><span>디자인 목적</span><select value={purpose} onChange={(e) => setPurpose(e.target.value)}>{purposes.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field"><span>톤</span><select value={tone} onChange={(e) => setTone(e.target.value)}>{tones.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field"><span>템플릿</span><select value={template} onChange={(e) => setTemplate(e.target.value)}>{templates.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field"><span>문구</span><textarea value={text} onChange={(e) => setText(e.target.value)} /></label>
          <button className="admin-primary-button" type="button">콘텐츠 캘린더에 저장</button>
        </aside>
        <section className="design-preview-card">
          <img src={selectedAsset.fileUrl} alt="" />
          <div>
            <small>{hospital.name} · {channel}</small>
            <h2>{text}</h2>
            <p>{purpose} / {tone} / {template}</p>
          </div>
        </section>
      </section>
    </main>
  );
}
