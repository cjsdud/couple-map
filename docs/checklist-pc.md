# PC에서 할 일 (설치 없이, 브라우저만)

싸지방처럼 프로그램 설치가 어려운 PC에서도 브라우저만으로 APK를 만들 수 있다.
빌드는 GitHub 서버가 대신 돌린다.

## 1. GitHub Secrets 4개 등록 (한 번만)

레포 → **Settings** → 왼쪽 **Secrets and variables** → **Actions** → **New repository secret**

이름과 값을 하나씩 4번 등록한다 (값은 채팅으로 받은 `.env.local` 내용과 동일).

| Name | 설명 |
|---|---|
| `VITE_SUPABASE_URL` | Supabase 주소 |
| `VITE_SUPABASE_ANON_KEY` | Supabase 공개 키 (길다) |
| `VITE_KAKAO_REST_KEY` | 카카오 REST 키 — 로그인용 |
| `VITE_KAKAO_JS_KEY` | 카카오 JS 키 — 지도용 |

> 넷 중 하나라도 빠지면 그 기능이 빠진 앱이 만들어진다.
> (실제로 JS 키가 빠져서 앱인토스 번들에 지도가 안 들어간 적 있음)

## 2. APK 만들기

레포 → **Actions** 탭 → 왼쪽에서 **Android 빌드** → 오른쪽 **Run workflow** →
브랜치 `claude/phase-0-spike-syl5pd` 확인 후 초록 **Run workflow** 버튼.

5~10분 뒤 완료되면 그 실행 페이지 맨 아래 **Artifacts**에 `dohwaji-debug-apk`가 생긴다.

## 3. 폰에 설치

APK는 폰에서 받아야 설치가 편하다. 폰 브라우저로 GitHub 접속 →
Actions → 방금 실행 → Artifacts에서 내려받기 → 설치
(안드로이드가 "출처를 알 수 없는 앱" 경고를 내면 허용).

## 4. 설치 후 확인할 것

- [ ] 앱 아이콘이 도화지 마크(하트+핀)로 보이는가
- [ ] 첫 화면(로그인)이 뜨는가 — 하얀 화면이면 Secrets 누락
- [ ] **카카오로 시작하기** → 브라우저 떴다가 앱으로 돌아오는가
- [ ] 지도 탭에서 도화지 지도가 보이는가
- [ ] 실지도 토글 — 안 되면 도화지로 자동 전환되는지 (앱에서는 안 될 수 있음, 정상)
- [ ] 오늘 탭에서 사진 올리기 (사진 권한 요청)
- [ ] 핀 만들 때 "지금 여기" (위치 권한 요청)

안 되는 항목이 있으면 **어느 단계에서 멈췄는지**만 알려주면 된다.

## 참고: 소스 받아서 화면만 보기 (Node.js가 깔려 있다면)

```bash
git clone https://github.com/cjsdud/couple-map.git
cd couple-map
git checkout claude/phase-0-spike-syl5pd
npm install
npm run dev
```

`.env.local`이 없어도 `?mock=1`을 붙이면 예시 데이터로 화면은 볼 수 있다.
→ http://localhost:5173/?mock=1
