-- 라이브러리 초기 시드 데이터 (명언 20 · 비즈니스 영어 20 · 마케팅 사례 10 · 컨설팅 프레임워크 8)
-- library-schema.sql 실행 후 이 파일을 실행하세요.
-- 아래 내용은 실제 인물 발언/공개된 캠페인·이론에 대한 요약이며, 원문 그대로의 저작물 전재가 아니라 사실관계 요약입니다.

-- ═══ 명언 20개 ═══
insert into public.library_items (category, title, content, tags) values
('quote','성공은 실패를 거듭하면서도 열정을 잃지 않는 능력이다', '{"text":"Success is the ability to go from failure to failure without losing your enthusiasm.","author":"Winston Churchill","translation_ko":"성공은 실패를 거듭하면서도 열정을 잃지 않는 능력이다.","theme":"인내"}', '{성공,인내,리더십}'),
('quote','미래를 예측하는 가장 좋은 방법은 그것을 만드는 것이다', '{"text":"The best way to predict the future is to create it.","author":"Peter Drucker","translation_ko":"미래를 예측하는 가장 좋은 방법은 그것을 만드는 것이다.","theme":"혁신"}', '{혁신,경영}'),
('quote','단순함이야말로 최고의 정교함이다', '{"text":"Simplicity is the ultimate sophistication.","author":"Leonardo da Vinci","translation_ko":"단순함이야말로 최고의 정교함이다.","theme":"디자인"}', '{디자인,창의성}'),
('quote','시작하는 방법은 말하기를 멈추고 행동을 시작하는 것이다', '{"text":"The way to get started is to quit talking and begin doing.","author":"Walt Disney","translation_ko":"시작하는 방법은 말하기를 멈추고 행동을 시작하는 것이다.","theme":"실행력"}', '{실행력,동기부여}'),
('quote','고객이 원하는 것을 물어보고 그것을 만들려 하지 마라, 다음 세대가 원할 것을 만들어라', '{"text":"If I had asked people what they wanted, they would have said faster horses.","author":"Henry Ford","translation_ko":"사람들에게 무엇을 원하는지 물었다면, 더 빠른 말이라고 답했을 것이다.","theme":"혁신"}', '{혁신,제품}'),
('quote','완벽함이 아니라 진전을 추구하라', '{"text":"Done is better than perfect.","author":"Sheryl Sandberg","translation_ko":"완벽보다 완료가 낫다.","theme":"실행력"}', '{실행력,생산성}'),
('quote','브랜드는 제품이 아니라 고객의 기억이다', '{"text":"A brand is no longer what we tell the consumer it is — it is what consumers tell each other it is.","author":"Scott Cook","translation_ko":"브랜드는 우리가 소비자에게 말하는 것이 아니라, 소비자들이 서로에게 말하는 것이다.","theme":"브랜딩"}', '{브랜딩,마케팅}'),
('quote','리더십은 영향력이다, 그 이상도 이하도 아니다', '{"text":"Leadership is influence, nothing more, nothing less.","author":"John C. Maxwell","translation_ko":"리더십은 영향력이다, 그 이상도 이하도 아니다.","theme":"리더십"}', '{리더십}'),
('quote','당신이 사랑하는 일을 하지 않으면 시간을 낭비하는 것이다', '{"text":"Your work is going to fill a large part of your life, and the only way to be truly satisfied is to do what you believe is great work.","author":"Steve Jobs","translation_ko":"일은 인생의 큰 부분을 차지한다. 진정으로 만족하려면 스스로 위대하다고 믿는 일을 해야 한다.","theme":"동기부여"}', '{동기부여,커리어}'),
('quote','전략 없는 전술은 패배로 가는 가장 느린 길이다', '{"text":"Strategy without tactics is the slowest route to victory. Tactics without strategy is the noise before defeat.","author":"Sun Tzu","translation_ko":"전략 없는 전술은 승리로 가는 가장 느린 길이고, 전술 없는 전략은 패배 직전의 소음이다.","theme":"전략"}', '{전략,경영}'),
('quote','당신의 시간은 한정되어 있다, 남의 삶을 사느라 낭비하지 말라', '{"text":"Your time is limited, so don''t waste it living someone else''s life.","author":"Steve Jobs","translation_ko":"당신의 시간은 한정되어 있다, 남의 삶을 사느라 낭비하지 말라.","theme":"동기부여"}', '{동기부여}'),
('quote','좋은 디자인은 가능한 한 적은 디자인이다', '{"text":"Good design is as little design as possible.","author":"Dieter Rams","translation_ko":"좋은 디자인은 가능한 한 적은 디자인이다.","theme":"디자인"}', '{디자인}'),
('quote','팀워크는 평범한 사람들이 비범한 결과를 내게 한다', '{"text":"Talent wins games, but teamwork and intelligence win championships.","author":"Michael Jordan","translation_ko":"재능은 경기를 이기게 하지만, 팀워크와 지성은 챔피언십을 이기게 한다.","theme":"팀워크"}', '{팀워크,리더십}'),
('quote','고객 경험이 새로운 마케팅이다', '{"text":"Customer experience is the new marketing.","author":"Steve Cannon","translation_ko":"고객 경험이 새로운 마케팅이다.","theme":"마케팅"}', '{마케팅,고객경험}'),
('quote','혁신은 리더와 추종자를 구분하는 기준이다', '{"text":"Innovation distinguishes between a leader and a follower.","author":"Steve Jobs","translation_ko":"혁신은 리더와 추종자를 구분하는 기준이다.","theme":"혁신"}', '{혁신,리더십}'),
('quote','측정할 수 없으면 관리할 수 없다', '{"text":"What gets measured gets managed.","author":"Peter Drucker","translation_ko":"측정할 수 없으면 관리할 수 없다.","theme":"경영"}', '{경영,데이터}'),
('quote','당신의 마진은 나의 기회다', '{"text":"Your margin is my opportunity.","author":"Jeff Bezos","translation_ko":"당신의 마진은 나의 기회다.","theme":"전략"}', '{전략,경쟁}'),
('quote','작게 시작해도 크게 생각하라', '{"text":"Think big, start small, scale fast.","author":"경영 격언","translation_ko":"크게 생각하고, 작게 시작하고, 빠르게 확장하라.","theme":"창업"}', '{창업,성장}'),
('quote','실패는 성공으로 가는 우회로일 뿐이다', '{"text":"I have not failed. I''ve just found 10,000 ways that won''t work.","author":"Thomas Edison","translation_ko":"나는 실패한 것이 아니다. 그저 통하지 않는 방법 만 가지를 찾았을 뿐이다.","theme":"인내"}', '{인내,실패}'),
('quote','최고의 마케팅은 마케팅처럼 느껴지지 않는다', '{"text":"The best marketing doesn''t feel like marketing.","author":"Tom Fishburne","translation_ko":"최고의 마케팅은 마케팅처럼 느껴지지 않는다.","theme":"마케팅"}', '{마케팅,콘텐츠}');

-- ═══ 비즈니스 영어 20개 ═══
insert into public.library_items (category, title, content, tags) values
('business_english','회의 시작할 때', '{"phrase":"Let''s dive right in.","translation_ko":"바로 본론으로 들어가시죠.","context":"meeting","formality":"neutral"}', '{회의}'),
('business_english','의견 정중하게 반박할 때', '{"phrase":"I see your point, but I have a slightly different take.","translation_ko":"이해합니다만, 저는 조금 다르게 생각합니다.","context":"meeting","formality":"formal"}', '{회의,협상}'),
('business_english','이메일 첫 문장', '{"phrase":"I hope this email finds you well.","translation_ko":"잘 지내고 계시길 바랍니다.","context":"email","formality":"formal"}', '{이메일}'),
('business_english','회신 요청할 때', '{"phrase":"Could you get back to me by end of day Friday?","translation_ko":"금요일 퇴근 전까지 회신 주실 수 있을까요?","context":"email","formality":"neutral"}', '{이메일}'),
('business_english','협상 시작', '{"phrase":"Let''s find a solution that works for both sides.","translation_ko":"양쪽 모두에게 통하는 해결책을 찾아보시죠.","context":"negotiation","formality":"formal"}', '{협상}'),
('business_english','가격 협상', '{"phrase":"Is there any flexibility on the price?","translation_ko":"가격에 조정 여지가 있을까요?","context":"negotiation","formality":"neutral"}', '{협상,가격}'),
('business_english','스몰토크 시작', '{"phrase":"How was your weekend?","translation_ko":"주말 잘 보내셨어요?","context":"small_talk","formality":"casual"}', '{스몰토크}'),
('business_english','미팅 마무리', '{"phrase":"Let''s circle back on this next week.","translation_ko":"이 건은 다음 주에 다시 논의하시죠.","context":"meeting","formality":"neutral"}', '{회의}'),
('business_english','프레젠테이션 시작', '{"phrase":"Today, I''ll walk you through our proposal.","translation_ko":"오늘은 저희 제안을 설명드리겠습니다.","context":"presentation","formality":"formal"}', '{프레젠테이션}'),
('business_english','질문 유도', '{"phrase":"Feel free to stop me if you have any questions.","translation_ko":"질문 있으시면 언제든 말씀해주세요.","context":"presentation","formality":"neutral"}', '{프레젠테이션}'),
('business_english','늦은 답장 사과', '{"phrase":"Apologies for the delayed response.","translation_ko":"답장이 늦어 죄송합니다.","context":"email","formality":"formal"}', '{이메일,사과}'),
('business_english','일정 조율', '{"phrase":"Does this time work for you, or would another slot be better?","translation_ko":"이 시간 괜찮으신가요, 아니면 다른 시간이 나을까요?","context":"scheduling","formality":"neutral"}', '{일정}'),
('business_english','동의 표현', '{"phrase":"That aligns with what we had in mind.","translation_ko":"저희가 생각한 것과 일치하네요.","context":"meeting","formality":"formal"}', '{회의,동의}'),
('business_english','우려 표현', '{"phrase":"I have some reservations about the timeline.","translation_ko":"일정에 대해 조금 우려되는 부분이 있습니다.","context":"meeting","formality":"formal"}', '{회의,우려}'),
('business_english','제안 마무리', '{"phrase":"We''d love the opportunity to work together.","translation_ko":"함께 일할 기회가 있길 바랍니다.","context":"proposal","formality":"formal"}', '{제안}'),
('business_english','감사 인사', '{"phrase":"Thank you for taking the time to meet with us.","translation_ko":"시간 내어 미팅해주셔서 감사합니다.","context":"meeting","formality":"formal"}', '{감사}'),
('business_english','명함 교환 시', '{"phrase":"Here''s my card — please don''t hesitate to reach out.","translation_ko":"제 명함입니다 — 편하게 연락 주세요.","context":"networking","formality":"neutral"}', '{네트워킹}'),
('business_english','이메일 마무리', '{"phrase":"Looking forward to hearing from you.","translation_ko":"회신 기다리겠습니다.","context":"email","formality":"formal"}', '{이메일}'),
('business_english','의견 요청', '{"phrase":"What are your thoughts on this?","translation_ko":"이 부분에 대해 어떻게 생각하세요?","context":"meeting","formality":"neutral"}', '{회의}'),
('business_english','계약 조건 확인', '{"phrase":"Let''s make sure we''re on the same page before we sign.","translation_ko":"서명 전에 서로 이해가 같은지 확인해보시죠.","context":"contract","formality":"formal"}', '{계약}');

-- ═══ 마케팅 사례 10개 ═══
insert into public.library_items (category, title, content, tags) values
('marketing_case','나이키 — Just Do It', '{"company":"Nike","campaign":"Just Do It","summary":"1988년 시작된 슬로건 캠페인으로, 제품이 아니라 도전정신이라는 감정적 가치를 브랜드와 연결시켜 스포츠용품을 넘어 라이프스타일 브랜드로 자리잡게 한 대표 사례.","industry":"스포츠용품","year":"1988~"}', '{브랜딩,슬로건}'),
('marketing_case','애플 — Think Different', '{"company":"Apple","campaign":"Think Different","summary":"1997년 잡스 복귀 직후 시작된 캠페인. 제품 스펙이 아니라 세상을 바꾼 인물들과의 정서적 동일시를 통해 브랜드 정체성을 재정의한 사례.","industry":"IT/전자제품","year":"1997"}', '{브랜딩,정체성}'),
('marketing_case','에어비앤비 — Belong Anywhere', '{"company":"Airbnb","campaign":"Belong Anywhere","summary":"숙박이 아니라 소속감을 판매한다는 포지셔닝 전환. 사용자생성콘텐츠(UGC)와 지역 커뮤니티 스토리텔링을 적극 활용해 신뢰를 구축한 사례.","industry":"공유숙박","year":"2014~"}', '{포지셔닝,UGC}'),
('marketing_case','도브 — Real Beauty', '{"company":"Dove","campaign":"Campaign for Real Beauty","summary":"획일적인 미의 기준에 반기를 든 캠페인. 일반인 여성을 모델로 기용해 사회적 메시지와 브랜드를 결합, 논쟁을 통한 화제성 확보의 대표 사례.","industry":"뷰티/생활용품","year":"2004~"}', '{사회적마케팅,논쟁마케팅}'),
('marketing_case','올드스파이스 — The Man Your Man Could Smell Like', '{"company":"Old Spice","campaign":"The Man Your Man Could Smell Like","summary":"유머와 화제성 중심의 바이럴 광고로 노후화된 브랜드 이미지를 반전시킨 사례. 소셜미디어 실시간 반응 영상으로 2차 확산까지 설계.","industry":"생활용품","year":"2010"}', '{바이럴,리브랜딩}'),
('marketing_case','코카콜라 — Share a Coke', '{"company":"Coca-Cola","campaign":"Share a Coke","summary":"제품 라벨에 이름을 넣어 개인화를 실현한 캠페인. 소비자가 직접 사진을 찍어 공유하게 만드는 구조로 오프라인 제품을 SNS 콘텐츠로 전환시킨 사례.","industry":"음료","year":"2011~"}', '{개인화,SNS확산}'),
('marketing_case','레드불 — 콘텐츠 마케팅', '{"company":"Red Bull","campaign":"Stratos / 미디어하우스 전략","summary":"에너지드링크 회사가 아니라 익스트림스포츠 미디어 회사로 자기규정. 성층권 낙하 이벤트 등 자체 콘텐츠 생산으로 브랜드=콘텐츠 공식을 만든 사례.","industry":"음료","year":"2012~"}', '{콘텐츠마케팅,브랜디드콘텐츠}'),
('marketing_case','스포티파이 — Wrapped', '{"company":"Spotify","campaign":"Spotify Wrapped","summary":"개인화된 연말 리캡 데이터를 시각화해 자발적 SNS 공유를 유도. 데이터 기반 개인화 콘텐츠가 곧 바이럴 마케팅이 될 수 있음을 보여준 사례.","industry":"음악스트리밍","year":"2016~"}', '{데이터마케팅,개인화}'),
('marketing_case','파타고니아 — Don''t Buy This Jacket', '{"company":"Patagonia","campaign":"Don''t Buy This Jacket","summary":"과소비를 줄이자며 자사 제품을 사지 말라고 광고한 역설적 캠페인. 지속가능성 가치를 브랜드 신뢰로 전환시킨 사례.","industry":"아웃도어","year":"2011"}', '{지속가능성,역설적마케팅}'),
('marketing_case','이케아 — 이케아 효과 활용', '{"company":"IKEA","campaign":"셀프 조립 경험 설계","summary":"소비자가 직접 조립하는 과정 자체를 경험으로 설계해 애착과 만족도를 높인 사례(이케아 효과: 직접 만든 것에 더 높은 가치를 부여하는 심리). 매장 동선 설계도 체험 마케팅의 일부로 활용.","industry":"가구/리테일","year":"지속적"}', '{체험마케팅,심리학}');

-- ═══ 컨설팅 프레임워크 8개 ═══
insert into public.library_items (category, title, content, tags) values
('consulting_framework','맥킨지 7S 모델', '{"firm":"McKinsey","description":"조직을 Strategy, Structure, Systems, Shared Values, Skills, Style, Staff 7가지 요소로 나눠 정합성을 진단하는 조직 분석 프레임워크.","use_case":"조직개편, 합병 후 통합(PMI) 시 조직 정합성 점검"}', '{조직,전략}'),
('consulting_framework','BCG 매트릭스', '{"firm":"Boston Consulting Group","description":"사업(제품)을 시장성장률과 상대적 시장점유율 두 축으로 Star/Cash Cow/Question Mark/Dog 4분면에 배치해 포트폴리오를 분석하는 기법.","use_case":"사업 포트폴리오 우선순위 결정, 투자/철수 판단"}', '{포트폴리오,전략}'),
('consulting_framework','포터의 5가지 경쟁요인', '{"firm":"Michael Porter (Harvard)","description":"기존 경쟁자, 신규 진입자, 대체재, 구매자 교섭력, 공급자 교섭력 5가지로 산업의 매력도와 경쟁 구조를 분석하는 프레임워크.","use_case":"신규 시장 진출 타당성 검토, 산업 구조 분석"}', '{산업분석,경쟁전략}'),
('consulting_framework','SWOT 분석', '{"firm":"범용(경영학 기본)","description":"내부 요인(강점/약점)과 외부 요인(기회/위협)을 교차 분석해 전략 방향을 도출하는 가장 기본적인 전략 수립 도구.","use_case":"사업계획서, 신규 프로젝트 착수 전 상황 진단"}', '{전략,기획}'),
('consulting_framework','블루오션 전략', '{"firm":"INSEAD (김위찬·르네 마보안)","description":"경쟁이 치열한 기존 시장(레드오션)을 벗어나, 가치와 비용을 동시에 낮추거나 새로운 가치를 창출해 경쟁이 없는 새 시장을 만드는 전략론. ERRC(제거-감소-증가-창조) 프레임 사용.","use_case":"신사업 기획, 차별화 전략 수립"}', '{차별화,신사업}'),
('consulting_framework','MECE 원칙', '{"firm":"McKinsey","description":"Mutually Exclusive, Collectively Exhaustive(상호 배타적이며 전체를 포괄하는) 원칙. 문제를 중복 없이, 빠짐없이 구조화하는 컨설턴트의 기본 사고법.","use_case":"문제 정의, 보고서/제안서 구조화"}', '{문제해결,사고법}'),
('consulting_framework','균형성과표(BSC)', '{"firm":"Robert Kaplan & David Norton (Harvard)","description":"재무, 고객, 내부프로세스, 학습과성장 4가지 관점에서 균형 있게 성과를 관리하는 프레임워크. 재무지표에만 치우친 평가의 한계를 보완.","use_case":"조직 성과 관리, KPI 설계"}', '{성과관리,KPI}'),
('consulting_framework','디자인 씽킹', '{"firm":"IDEO / Stanford d.school","description":"공감(Empathize)-정의(Define)-아이디어(Ideate)-프로토타입(Prototype)-테스트(Test) 5단계로 사용자 중심 문제해결을 하는 방법론.","use_case":"신제품/서비스 기획, 고객경험 개선"}', '{혁신,고객경험}');
