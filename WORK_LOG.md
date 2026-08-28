# Morning Star 작업 일지

프로젝트에서 날짜별로 진행한 작업, 검증 결과, 주요 결정과 후속 과제를 기록한다. 최신 날짜를 위에 추가하며, 환경변수와 인증 키의 실제 값은 기록하지 않는다.

## 작성 형식

```text
## YYYY-MM-DD

### 목표
### 완료한 작업
### 검증 결과
### 관련 커밋
### 다음 작업
```

---

## 2026-08-28

### 목표

- 기존 Morning Star 데스크톱 앱을 로그인 가능한 웹 앱으로 확장한다.
- 사용자별 일정 데이터를 Supabase에 안전하게 저장한다.
- 로컬 PC를 켜 두지 않아도 접속할 수 있도록 공개 배포한다.
- GA4와 GTM을 연동해 개인정보를 최소화한 사용 분석 기반을 마련한다.

### 완료한 작업

#### 1. 로그인과 웹 실행 흐름 개선

- 이메일과 비밀번호 중심의 로그인 화면으로 개편했다.
- 회원가입, 로그인 유지, 비밀번호 표시, 로그아웃, 비밀번호 재설정 흐름을 보강했다.
- 인증되지 않은 사용자는 플래너를 초기화하지 않고 로그인 화면만 보도록 인증 게이트를 적용했다.
- 운영 브라우저가 데스크톱 전용 `pywebview` 브리지를 기다리지 않도록 초기화 조건을 분리했다.
- 데스크톱 경로는 유지하면서 브라우저용 설정, 활동 기록, 자주 하는 일 저장 fallback을 추가했다.

#### 2. Supabase 일정 저장과 보안 강화

- 일정 CRUD와 휴지통 조회·복원·비우기 흐름을 Supabase와 연결했다.
- 사용자 삭제는 복원 가능한 soft delete, 휴지통 비우기와 내부 정리는 hard delete로 구분했다.
- [`supabase/migrations/20260828000000_secure_schedule_items.sql`](supabase/migrations/20260828000000_secure_schedule_items.sql)을 Supabase SQL Editor에서 실행했다.
- `schedule_items`에 RLS를 활성화하고 익명 사용자의 테이블 권한을 제거했다.
- 인증 사용자가 자신의 `user_id`와 일치하는 행만 조회·생성·수정·삭제하도록 정책을 적용했다.
- 활성 일정과 휴지통 조회를 위한 부분 인덱스를 추가했다.

#### 3. GitHub와 Cloudflare Pages 배포

- GitHub 저장소의 `main` 브랜치를 Cloudflare Pages에 연결했다.
- Cloudflare 빌드 설정을 다음과 같이 구성했다.

  | 항목 | 설정 |
  |---|---|
  | Production branch | `main` |
  | Root directory | `ui` |
  | Build command | `npm run build` |
  | Build output directory | `dist` |

- Cloudflare에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GTM_ID` 환경변수를 등록했다.
- 공개 주소 `https://morning-star-8a7.pages.dev` 배포에 성공했다.
- 후속 `main` 커밋이 자동으로 다시 빌드·배포되는 것까지 확인했다.

#### 4. GA4와 GTM 연동

- Morning Star용 GA4 속성·웹 데이터 스트림과 GTM 웹 컨테이너를 구성했다.
- 앱 이벤트를 `dataLayer → GTM → GA4` 단일 경로로 전달하도록 구현했다.
- 사용자가 분석 수집을 허용하기 전에는 GTM 스크립트를 로드하지 않도록 동의 기반 로더를 적용했다.
- 설정 화면에서 분석 수집 허용과 철회를 변경할 수 있게 했다.
- 이벤트 허용 목록을 적용해 정의되지 않은 데이터가 전송되지 않도록 제한했다.
- 이메일, 닉네임, 일정 제목·내용, 메모, 파일명, 정확한 목표 시간은 전송 대상에서 제외했다.
- 페이지 주소에서는 쿼리 문자열과 해시를 제거해 인증 콜백 정보가 GA4에 기록되지 않도록 했다.
- GTM 컨테이너를 게시하고 운영 사이트에서 태그를 확인했다.

#### 5. 문서화

- [`ui/ANALYTICS_SETUP.md`](ui/ANALYTICS_SETUP.md)에 GA4/GTM 구성과 개인정보 보호 원칙을 정리했다.
- [`MORNING_STAR_INTERVIEW_GUIDE.md`](MORNING_STAR_INTERVIEW_GUIDE.md)에 웹 전환, 인증, RLS, 배포, 분석 연동 내용을 면접 설명 형식으로 정리했다.
- 날짜별 작업 내역을 계속 누적할 수 있도록 이 작업 일지를 추가했다.

### 검증 결과

| 검증 항목 | 결과 |
|---|---|
| React/JavaScript lint | 통과 |
| Vite 운영 빌드 | 통과 |
| Supabase RLS·정책·인덱스 SQL | 실행 성공 |
| Cloudflare Pages 최초 배포 | 성공 |
| GitHub `main` 후속 커밋 자동 배포 | 성공 |
| 공개 사이트 접속 | 성공 |
| Tag Assistant의 GTM·GA4 태그 실행 | 성공 |
| GA4 실시간 활성 사용자 수신 | 성공 |
| GA4 `page_view`, `app_open`, `first_visit`, `session_start` 이벤트 수신 | 성공 |

### 주요 구조와 결정

```text
GitHub main
  -> Cloudflare Pages 빌드 및 정적 파일 배포
  -> 사용자 브라우저에서 React 실행
       -> Supabase Auth/Postgres: 로그인과 사용자별 일정 데이터
       -> GTM -> GA4: 동의한 사용자의 허용된 분석 이벤트
```

- 프론트엔드 운영 코드의 기준은 GitHub `main` 브랜치다.
- 사용자 일정 데이터의 기준은 Supabase다.
- 프론트엔드 키를 숨기는 대신 Postgres RLS를 실제 데이터 접근 경계로 사용한다.
- `.env`는 Git에서 제외하고 저장소에는 환경변수 이름만 기록한다.
- `service_role` 키는 브라우저 코드와 문서에 사용하지 않는다.

### 관련 커밋

| 커밋 | 내용 |
|---|---|
| `cb959a9` | 인증된 웹 배포, 로그인 UX, 브라우저 호환, Supabase RLS 준비 |
| `eebec90` | 동의 기반 GA4/GTM 사용 분석 연동 |
| `c02b0aa` | 배포·보안·분석 면접 설명 문서 추가 |

### 다음 작업

- 운영 주소 기준 회원가입·이메일 확인·로그인 전체 흐름을 E2E로 검증한다.
- 비밀번호 재설정 메일 발송부터 새 비밀번호 저장까지 검증한다.
- 서로 다른 두 계정으로 일정 데이터가 완전히 격리되는지 RLS 통합 테스트를 추가한다.
- 주요 일정 CRUD와 휴지통 시나리오의 브라우저 자동화 테스트를 추가한다.
- 새 Supabase 프로젝트에서도 재현할 수 있도록 전체 DB 스키마와 마이그레이션 이력을 정리한다.
