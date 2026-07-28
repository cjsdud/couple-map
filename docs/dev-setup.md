# 내 컴퓨터에서 개발·빌드하기

윈도우 기준. 하모니카(우분투 계열)도 거의 같고, 다른 부분만 각 절 끝에 따로 적었다.
목표는 두 가지 — **브라우저에서 화면 확인**, **내 폰에 앱 설치해서 확인**.

## 0. 준비물 (한 번만)

| 프로그램 | 받는 곳 | 비고 |
|---|---|---|
| Node.js LTS | https://nodejs.org | 22 버전대. 설치 중 옵션은 기본값 그대로 |
| Git | https://git-scm.com | 소스 받기용 |
| Android Studio | https://developer.android.com/studio | JDK·안드로이드 SDK가 함께 설치됨 |

Android Studio는 첫 실행 때 "Standard" 설치를 고르면 필요한 걸 알아서 받는다 (수 GB, 시간 좀 걸림).

> **하모니카**: Node는 `sudo apt install nodejs npm`보다 [nvm](https://github.com/nvm-sh/nvm)으로 22 버전을 까는 쪽이 덜 꼬인다.
> Android Studio는 공식 tar.gz를 풀어서 `bin/studio.sh` 실행.

## 1. 소스 받기

윈도우는 **PowerShell**, 하모니카는 **터미널**을 열고:

```bash
git clone https://github.com/cjsdud/couple-map.git
cd couple-map
git checkout claude/phase-0-spike-syl5pd
npm install
```

`npm install`은 몇 분 걸린다.

## 2. 키 파일 만들기

프로젝트 폴더 안에 **`.env.local`** 파일을 만들고 아래 4줄을 넣는다.
(값은 채팅으로 받은 것을 쓴다. 이 파일은 git에 올라가지 않게 되어 있다.)

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_KAKAO_REST_KEY=...
VITE_KAKAO_JS_KEY=...
```

> 윈도우 메모장은 `.env.local.txt`로 저장해 버리는 일이 잦다.
> 저장 창에서 파일 형식을 "모든 파일"로 바꾸고 이름을 `.env.local`로 적을 것.

## 3. 브라우저에서 확인 (제일 빠름)

```bash
npm run dev
```

주소가 뜨면(보통 http://localhost:5173) 브라우저로 연다. 코드를 고치면 **저장하는 순간 화면이 바뀐다.**
화면·디자인 확인은 이걸로 하는 게 제일 빠르다. 끄려면 터미널에서 `Ctrl + C`.

예시 데이터로 둘러보려면 주소 뒤에 `?mock=1`을 붙인다 → `http://localhost:5173/?mock=1`

## 4. 내 폰에 앱 설치해서 확인

### 4-1. 폰 준비 (한 번만)

1. 설정 → 휴대전화 정보 → **빌드번호를 7번 연타** → "개발자가 되었습니다"
2. 설정 → 개발자 옵션 → **USB 디버깅** 켜기
3. USB로 컴퓨터에 연결 → 폰에 뜨는 "USB 디버깅 허용" **허용**

### 4-2. 앱 실행

```bash
npm run build
npx cap sync android
npx cap open android
```

Android Studio가 열린다. 처음엔 하단에 Gradle 동기화가 몇 분 돌고, 끝나면
위쪽에 내 폰 이름이 보인다. **▶ (Run) 버튼**을 누르면 폰에 설치되고 바로 실행된다.

이후로 웹 코드를 고쳤을 때는 `npm run build && npx cap sync android` 다음 다시 ▶.

> **하모니카**: 폰을 꽂아도 안 잡히면 USB 권한 문제다.
> ```bash
> sudo usermod -aG plugdev $USER   # 로그아웃 후 재로그인
> ```
> 그래도 안 되면 `lsusb`로 제조사 ID를 확인해 `/etc/udev/rules.d/51-android.rules`에 규칙 추가.

## 5. 설치용 APK 파일로 뽑기

폰에 바로 설치하지 않고 파일로 받고 싶을 때:

```bash
cd android
gradlew assembleDebug        # 하모니카는 ./gradlew assembleDebug
```

결과물: `android/app/build/outputs/apk/debug/app-debug.apk`
이 파일을 폰으로 옮겨 설치하면 된다 (출처를 알 수 없는 앱 설치 허용 필요).

## 6. 자주 쓰는 명령어

| 하고 싶은 것 | 명령 |
|---|---|
| 브라우저에서 화면 보기 | `npm run dev` |
| 오류 검사 (커밋 전) | `npm run typecheck && npm run lint` |
| 웹 빌드 | `npm run build` |
| 웹 결과물을 앱에 반영 | `npx cap sync android` |
| Android Studio 열기 | `npx cap open android` |
| 앱인토스 번들 만들기 | `npm run ait:build` → `dohwaji.ait` |

## 7. 막힐 때

**`npm install`에서 실패** — Node 버전 확인 (`node -v`, 22.x여야 함).

**앱은 뜨는데 화면이 하얗다** — `.env.local`을 만든 뒤 `npm run build`를 다시 돌리고
`npx cap sync android`까지 했는지 확인. 웹 빌드 결과물이 앱 안으로 복사돼야 한다.

**카카오 로그인이 안 된다** — Kakao Developers → 카카오 로그인 → Redirect URI에
`dohwaji://kakao`가 등록돼 있어야 한다 (네이티브 앱은 이 주소로 돌아온다).

**지도(실지도)가 안 뜬다** — `VITE_KAKAO_JS_KEY`가 `.env.local`에 있는지,
그리고 Kakao Developers 플랫폼(Web) 사이트 도메인 등록을 확인.

**Gradle 동기화가 계속 실패** — Android Studio → File → Invalidate Caches → Restart.
