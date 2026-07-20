import imageCompression from 'browser-image-compression';

/**
 * 사진 파이프라인 1단계 (tech-design §6): 업로드 전 클라이언트 압축.
 *
 * - 장변 1,600px, WebP 재인코딩 (무료 티어 공통 규격).
 * - EXIF 제거 (절대 규칙 4): browser-image-compression은 이미지를 캔버스에
 *   디코드한 뒤 새로 인코딩한다. 캔버스 재인코딩 결과물에는 원본의 EXIF
 *   메타데이터(GPS 위치 포함)가 실리지 않으므로, 이 함수를 거친 Blob에는
 *   위치 정보가 남지 않는다. (`preserveExif` 옵션은 기본값 false를 유지할 것 —
 *   켜면 이 보장이 깨진다.) 위치는 daily_photos.lat/lng 별도 필드로만 저장한다.
 *
 * @returns 압축된 WebP Blob. 업로드 시 contentType은 'image/webp'.
 */
export async function prepareUpload(file: File): Promise<Blob> {
  return imageCompression(file, {
    maxWidthOrHeight: 1600,
    fileType: 'image/webp',
    initialQuality: 0.85,
    useWebWorker: true,
  });
}
