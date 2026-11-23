/* ============================================================
   매물콕 — 연결 설정
   ------------------------------------------------------------
   아래 두 칸을 본인 Supabase 프로젝트 값으로 채우면 바로 운영 모드가 됩니다.
   비어 있으면 '데모 모드'로 열리고, 기록은 이 브라우저에만 저장됩니다.

   Supabase > Project Settings > API 에서 복사:
     SUPABASE_URL      = Project URL          (예: https://abcdefghijk.supabase.co)
     SUPABASE_ANON_KEY = anon(공개) 키        (publishable 키, 공개되어도 되는 키)

   ※ service_role 키는 절대 넣지 마세요. anon 키는 공개용이며,
     데이터 보호는 supabase_schema.sql 의 RLS 정책이 담당합니다.
   ============================================================ */
window.CENTUM_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',

  /* 로그인 메일의 '비밀번호 재설정' 링크가 돌아올 주소.
     비워 두면 이 페이지의 현재 주소로 돌아옵니다.
     예: 'https://maemulcok.github.io/' */
  SITE_URL: 'https://maemulcok.github.io/',

  /* 배포본 이름 (내보내기 파일과 화면 하단에 표시) */
  APP_NAME: '매물콕',
  APP_VERSION: '1.0'
};
