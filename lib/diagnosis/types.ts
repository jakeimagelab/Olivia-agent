export type Stage =
  | "개원예정"
  | "신규오픈"
  | "리뉴얼"
  | "정기관리"
  | "촬영만";

export type Concern =
  | "전문성부족"
  | "사진노후"
  | "의료진신뢰"
  | "공간매력부족"
  | "콘텐츠부족"
  | "홈페이지부조화"
  | "AI검색대비"
  | "기타";

export type Department =
  | "피부과"
  | "성형외과"
  | "치과"
  | "안과"
  | "정형외과"
  | "신경외과"
  | "마취통증의학과"
  | "한방병원·한의원"
  | "검진내과"
  | "산부인과"
  | "정신건강의학과"
  | "병원급";

export type Usage =
  | "홈페이지"
  | "네이버플레이스"
  | "블로그SNS"
  | "광고랜딩"
  | "병원내부사인"
  | "브로슈어"
  | "AI검색콘텐츠";

export type Impression =
  | "프리미엄·럭셔리"
  | "신뢰감·전문성"
  | "따뜻함·편안함"
  | "모던·미니멀"
  | "트렌디·감각적"
  | "친근함·캐주얼"
  | "자연·내추럴"
  | "권위·정통";

export type Content =
  | "의료진 프로필"
  | "의료진 단체사진"
  | "인테리어·분위기"
  | "진료연출"
  | "브랜드영상"
  | "홈페이지 제작"
  | "블로그·SNS 콘텐츠"
  | "언론홍보"
  | "기타요청";

export type Budget =
  | "100이하"
  | "100-200"
  | "200-300"
  | "300-500"
  | "500이상"
  | "추천받기";

export type Timeline = "2주내" | "1개월내" | "2-3개월내" | "미정";

export type PhotoCategory =
  | "원장님 프로필사진"
  | "진료연출장면"
  | "병원 공간사진"
  | "원하는 이미지";

export type UploadedPhoto = {
  category: PhotoCategory | string;
  name: string;
  size: number;
  type: string;
};

export type Package =
  | "Premium"
  | "Premium Plus"
  | "Homepage"
  | "Branding Content";

export type DiagnosisType =
  | "개원 브랜딩형"
  | "신뢰 보완형"
  | "공간 이미지 강화형"
  | "진료 장면 설계형"
  | "콘텐츠 확장형";

export interface Answers {
  stage?: Stage;
  concerns: Concern[];
  department?: Department;
  usages: Usage[];
  location?: string;
  impressions: Impression[];
  contents: Content[];
  budget?: Budget;
  timeline?: Timeline;

  hospitalName?: string;
  contactRole?: string;
  phone?: string;
  email?: string;
  consultationOptin: boolean;

  uploadedPhotos?: UploadedPhoto[];
  photoUploadConsent?: boolean;
  photoMemo?: string;
  referenceUrl?: string;
}
