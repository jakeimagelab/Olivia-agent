# JPEG 리사이즈 Orientation 정규화 설계

## 문제

서버·Mac Studio 리사이즈는 `sharp(...).rotate()`로 EXIF 방향을 픽셀에 적용하고, 브라우저 리사이즈는 방향이 적용된 `ImageBitmap`을 canvas에 다시 그린다. 두 경로 모두 새 JPEG 픽셀은 이미 바로 서 있지만, 공통 `preserveJpegMetadata()`가 원본 APP1(EXIF)을 그대로 복원해 Orientation 값까지 되살린다. Orientation을 따르는 뷰어는 결과를 다시 회전시킨다.

## 결정

`lib/photoResize/jpegMetadata.ts`에서 원본 메타데이터 세그먼트를 복사할 때 EXIF APP1 세그먼트의 IFD0 Orientation 태그(`0x0112`) 값만 `1`로 정규화한다. JPEG와 원본 버퍼는 수정하지 않고, `extractJpegMetadataSegments()`가 만든 세그먼트 복사본만 변경한다.

## EXIF 처리

1. APP1 페이로드가 `Exif\0\0`으로 시작하는지 확인한다. XMP 등 다른 APP1은 그대로 둔다.
2. TIFF 헤더의 바이트 순서가 `II` 또는 `MM`인지 확인한다.
3. TIFF magic 값 `42`와 IFD0 오프셋을 해당 바이트 순서로 읽는다.
4. IFD0 엔트리 수와 각 12바이트 엔트리의 범위를 검사한다.
5. 태그 `0x0112`, 타입 SHORT(`3`), count `1`인 엔트리를 찾으면 값 필드의 첫 SHORT를 해당 바이트 순서로 `1`로 쓴다.
6. 태그가 없거나 구조가 유효하지 않으면 원본 세그먼트를 그대로 반환한다. 파싱 오류 때문에 리사이즈를 실패시키지 않는다.

IFD0 밖의 EXIF, 촬영정보, 제조사 노트, 저작권, ICC(APP2), IPTC(APP13), XMP(APP1)는 변경하지 않는다.

## 적용 경로

두 리사이즈 구현은 이미 공통 `preserveJpegMetadata()`를 사용하므로 공통 함수 한 곳에서 정규화한다.

- `lib/photo-operations/node/photoResize.ts`: Sharp가 회전·리사이즈한 JPEG에 정규화된 메타데이터를 삽입한다.
- `lib/photoResize/resizePhotos.ts`: canvas 인코딩 JPEG에 같은 메타데이터를 삽입한다.

서버 경로의 메타데이터 보존 검증은 원본 APP 세그먼트와 바이트 단위로 완전히 같아야 한다는 기존 조건을 바꾼다. `preserveJpegMetadata(source, output)`을 다시 적용해도 출력이 달라지지 않는지를 검사해, Orientation 정규화 외 모든 보존 대상 세그먼트가 이미 존재하는지 확인한다.

## 테스트

- Little-endian EXIF Orientation 8을 1로 변경한다.
- Big-endian EXIF Orientation 8을 1로 변경한다.
- Orientation 1은 그대로 유지한다.
- Orientation 태그가 없거나 EXIF가 아닌 APP1은 변경하지 않는다.
- ICC·IPTC·XMP와 Orientation 외 EXIF 바이트가 유지된다.
- Sharp 실제 리사이즈에서 Orientation 8 세로 원본의 결과가 Orientation 1이며 픽셀 크기가 세로다.
- 결과에서 촬영일시, 카메라, 렌즈, 저작권 메타데이터가 유지된다.
- 가로 Orientation 1과 Orientation 없는 JPEG도 정상 처리된다.

실제 Canon 5D Mark IV 원본과 macOS Finder·미리보기의 육안 확인은 해당 원본 및 GUI 환경이 있을 때 수행하고, 자동 테스트와 구분해 보고한다.

## 비범위

- `.rotate()` 제거 또는 픽셀 재회전
- 메타데이터 보존 제거
- EXIF 전체 재직렬화
- 제조사별 비표준 Orientation 구조 추정
