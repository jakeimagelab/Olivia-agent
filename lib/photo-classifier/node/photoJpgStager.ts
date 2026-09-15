/**
 * PHOTO_STAGE_JPG의 공개 진입점은 유지한다.
 * 실제 PHASE 3 구현은 SSD1/JPG전체 → SSD2/<project>/JPG전체 COPY 모듈에 있다.
 */
export {
  stageProjectJpgToWorkStorage,
  type PhotoStageJpgFailure,
  type PhotoStageJpgInput,
  type PhotoStageJpgResult,
  type PhotoStageJpgSuccess,
} from "./photoJpgCopy";
