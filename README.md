# 🦛 하마필름 배포 가이드

## Vercel에 배포하기 (가장 쉬운 방법)

### 1단계: GitHub에 올리기

1. https://github.com 가입 (이미 있으면 패스)
2. 우측 상단 + → **"New repository"**
3. Repository name: `hamafilm` (아무거나 OK)
4. **"Create repository"** 클릭
5. 다음 화면에서 **"uploading an existing file"** 링크 클릭
6. 이 폴더의 모든 파일을 드래그&드롭 (또는 선택해서 업로드)
   - `package.json`
   - `vite.config.js`
   - `index.html`
   - `src/main.jsx`
   - `src/App.jsx`
7. 하단 **"Commit changes"** 클릭

### 2단계: Vercel에서 배포

1. https://vercel.com 접속 → **"Sign Up"** → **"Continue with GitHub"** 선택
2. 가입 후 대시보드에서 **"Add New..." → "Project"**
3. 방금 만든 `hamafilm` 저장소 옆 **"Import"** 클릭
4. 설정은 기본값 그대로 두고 **"Deploy"** 클릭
5. 1~2분 기다리면 완료! 🎉

### 3단계: URL 받기

배포 완료되면 `https://hamafilm-xxx.vercel.app` 같은 URL이 나옵니다.
이 URL을 친구들에게 공유하면 모두 같은 데이터로 동기화됩니다!

---

## 코드 수정하면?

GitHub에서 파일을 수정하거나 새로 업로드만 하면
Vercel이 자동으로 다시 배포합니다. (1~2분 소요)
