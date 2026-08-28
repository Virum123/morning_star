# Morning Star 웹 전환·보안·배포 면접 설명서

> 기준일: 2026-08-28
>
> 공개 주소: [https://morning-star-8a7.pages.dev](https://morning-star-8a7.pages.dev)
>
> 기능 구현 기준 커밋: `eebec90` (`main`, `origin/main`)
>
> 이 문서는 기존 `APP_REVIEW.md` 이후 실제로 진행한 인증, 웹 호환, 보안, 배포, 분석 연동 작업을 면접 설명용으로 정리한 문서다.

## 1. 30초 요약

Morning Star는 원래 Python `pywebview` 안에서 React UI를 실행하고 로컬 Markdown 파일을 다루는 데스크톱 플래너였다. 기존 데스크톱 경로를 제거하지 않고, Supabase Auth와 Postgres 기반 일정 저장소를 추가해 로그인 가능한 웹 앱으로 확장했다. 브라우저에서는 `pywebview`가 없어도 동작하도록 런타임 어댑터를 두었고, 데이터 보안은 프론트엔드 키를 숨기는 방식이 아니라 Postgres RLS로 사용자별 행 접근을 강제했다. 최종적으로 GitHub `main` 브랜치를 Cloudflare Pages에 연결해 로컬 PC를 켜 두지 않아도 접속 가능한 정적 웹 서비스로 배포했다.

## 2. 프로젝트의 출발점

기존 애플리케이션의 핵심 구조는 다음과 같았다.

- React/Vite가 플래너 화면을 담당했다.
- Python `pywebview`가 데스크톱 창과 프론트엔드 사이의 브리지 역할을 했다.
- 설정과 일정은 로컬 파일 및 앱 데이터 디렉터리에 저장됐다.
- 일간·주간·월간 화면은 Markdown 체크리스트 형태의 데이터를 공유했다.
- 새벽 2시를 하루의 경계로 보는 날짜 이동 로직이 있었다.

이 구조는 개인용 데스크톱 앱에는 적합했지만 다음 문제가 있었다.

1. 브라우저에는 `window.pywebview.api`가 없어서 그대로 배포하면 초기화가 지연되거나 파일 API 호출이 실패했다.
2. 사용자 계정과 사용자별 클라우드 데이터 격리가 없었다.
3. 로그인 화면이 버튼형 배너에 가까워 일반적인 이메일 로그인 UX와 달랐다.
4. 같은 제목의 일정이 있을 때 텍스트 기반 삭제는 잘못된 행을 지울 가능성이 있었다.
5. 앱을 계속 사용하려면 로컬 실행 환경이 필요했고 외부에서 접속할 주소가 없었다.

## 3. 기존 구현과 이번 작업의 구분

면접에서는 기존 기반과 이번 개선 범위를 구분해서 설명하는 것이 정확하다.

### 기존 기반

- Python/`pywebview` 데스크톱 호스트
- React 플래너 UI
- Markdown 중심의 일정 표현
- 날짜 마이그레이션과 회귀 테스트
- 일간·주간·월간·보관함·설정 화면

### 선행 클라우드 전환 커밋 `1d25b57`

- Supabase Auth 기본 로그인 흐름 도입
- `schedule_items` CRUD repository와 service 계층 추가
- DB 행을 기존 플래너 파일 모양으로 바꾸는 `scheduleMapper` 추가
- 플래너·보관함을 Supabase 일정 데이터와 연결

### 이번 마무리 커밋 `cb959a9`

- 요청 이미지에 맞춘 로그인 UI 재설계
- 로그인 유지, 비밀번호 표시, 회원가입, 로그아웃, 비밀번호 재설정 흐름 보강
- 프로덕션 브라우저 런타임 초기화 수정
- 브라우저용 설정·활동 기록·자주 하는 일 저장 fallback 추가
- 사용자 삭제와 내부 정리 삭제의 의미 분리
- Supabase 휴지통 조회·복원·비우기 추가
- owner-only RLS 마이그레이션 추가 및 적용
- Cloudflare 빌드용 환경 변수 예시 추가
- GitHub와 Cloudflare Pages를 연결해 공개 배포

### 사용자 분석 연동 커밋 `eebec90`

- 동의한 사용자에 한해서만 GTM을 로드하는 분석 동의 흐름 추가
- 앱 이벤트를 `dataLayer → GTM → GA4` 단일 경로로 전송
- 이벤트 허용 목록을 적용하고 이메일·일정 내용·메모·파일명 등 개인정보 전송 제외
- URL의 쿼리와 해시를 제거해 인증 콜백 정보가 GA4에 기록되지 않도록 처리
- Tag Assistant와 GA4 실시간 보고서에서 운영 배포의 이벤트 수신 확인

## 4. 최종 아키텍처

```text
사용자
  |
  +-- 웹 브라우저
  |     |
  |     +-- Cloudflare Pages: React/Vite 정적 파일 제공
  |             |
  |             +-- Supabase Auth: 회원가입, 로그인, 세션, 비밀번호 재설정
  |             +-- Supabase Postgres: schedule_items
  |             |       +-- RLS: auth.uid() = user_id
  |             +-- localStorage: 웹 전용 설정, 활동 기록, 자주 하는 일
  |             +-- GTM -> GA4: 동의 기반 익명화 사용 분석
  |
  +-- 데스크톱 앱
        |
        +-- React UI
        +-- window.pywebview.api
                +-- Python 호스트
                +-- 로컬 파일·OS 기능
```

핵심은 UI를 두 벌로 만들지 않고 같은 React 코드를 유지한 것이다. 런타임에서 `window.pywebview?.api` 존재 여부를 확인해 데스크톱 호스트 API와 브라우저 fallback 중 하나를 선택한다.

## 5. 주요 설계와 구현

### 5.1 전면 재작성 대신 어댑터 계층을 사용했다

기존 플래너 컴포넌트는 Markdown 파일과 비슷한 구조를 기대했다. 화면 전체를 DB 행 중심으로 다시 작성하면 일간·주간·월간 화면에서 회귀가 발생할 위험이 컸다.

그래서 다음 계층을 추가했다.

```text
Planner UI
  -> scheduleService
  -> scheduleMapper
  -> supabaseScheduleRepository
  -> Supabase schedule_items
```

- [`scheduleMapper.js`](ui/src/utils/scheduleMapper.js)는 DB 행과 기존 플래너 표현 사이를 변환한다.
- [`scheduleService.js`](ui/src/services/scheduleService.js)는 화면 단위 동작과 동기화를 조정한다.
- [`supabaseScheduleRepository.js`](ui/src/repositories/supabaseScheduleRepository.js)는 인증 사용자 확인과 DB CRUD만 담당한다.

이 선택으로 기존 UI의 변경 범위를 줄였지만, 장기적으로는 파일 모양의 중간 모델을 제거하고 일정 도메인 모델을 화면에서 직접 사용하는 것이 더 단순하다.

### 5.2 로그인 UX와 인증 상태를 하나의 흐름으로 통합했다

[`LoginPage.jsx`](ui/src/components/LoginPage.jsx)와 [`LoginPage.css`](ui/src/components/LoginPage.css)에 다음 기능을 구현했다.

- 이메일·비밀번호 입력 중심의 로그인 카드
- 비밀번호 표시/숨김
- 로그인 유지 선택
- 회원가입 모드
- 비밀번호 재설정 메일 요청
- 재설정 링크로 복귀했을 때 새 비밀번호 입력 모드
- 로딩 상태와 접근성용 상태 메시지

[`App.jsx`](ui/src/App.jsx)는 앱 콘텐츠보다 먼저 현재 세션을 확인한다. 로그인하지 않은 사용자는 플래너를 초기화하지 않고 로그인 화면만 보게 한다. Supabase의 `PASSWORD_RECOVERY` 이벤트를 받으면 비밀번호 변경 화면으로 전환하고, 로그아웃하면 다시 인증 게이트로 돌아간다.

개발용 `AuthDebugBanner`는 `import.meta.env.DEV`일 때만 렌더링되도록 해 운영 화면에 노출되지 않게 했다.

### 5.3 로그인 유지 여부를 저장소 선택으로 구현했다

Supabase 세션을 무조건 영구 보관하지 않고 [`supabaseClient.js`](ui/src/lib/supabaseClient.js)에 저장소 어댑터를 두었다.

- 로그인 유지 선택: `localStorage`
- 로그인 유지 해제: `sessionStorage`
- 저장 시 선택하지 않은 저장소의 같은 세션 값 제거
- 로그아웃 시 두 저장소에서 모두 제거

이 방식은 인증 라이브러리를 별도로 포크하지 않고 Supabase가 지원하는 사용자 정의 storage 인터페이스를 활용한 것이다.

### 5.4 데스크톱과 웹의 초기화 조건을 분리했다

기존 코드는 `pywebview` 객체를 기다리는 흐름이어서 브라우저에서도 불필요하게 대기할 수 있었다. [`App.jsx`](ui/src/App.jsx)에서 프로덕션 `http:`/`https:` 환경은 즉시 웹 런타임으로 초기화하고, 데스크톱 개발 환경만 `pywebview` 브리지를 기다리도록 변경했다.

[`api.js`](ui/src/utils/api.js)는 다음 원칙을 따른다.

- `window.pywebview?.api`가 있으면 기존 Python API 호출
- 없으면 브라우저 fallback 사용
- 웹 설정, 활동 기록, 자주 하는 일은 사용자 ID가 포함된 키로 `localStorage`에 저장
- 웹 휴지통은 Supabase의 삭제된 일정 행을 조회

이를 통해 기존 데스크톱 경로를 지우지 않고 웹 배포를 추가했다.

### 5.5 삭제 의미를 명확히 분리했다

사용자가 누른 삭제와 동기화 과정의 내부 정리는 의미가 다르다.

- 사용자 삭제: `deleted_at`을 기록하는 soft delete
- 휴지통 복원: `deleted_at = null`
- 휴지통 비우기: 실제 `DELETE`
- 편집 후 남는 불필요한 trailing row 정리: `showInTrash: false`로 hard delete

또한 [`DailyPlanner.jsx`](ui/src/components/DailyPlanner.jsx)는 가능하면 일정 제목이 아니라 `scheduleRows[lineIndex].id`를 사용해 삭제한다. 같은 제목의 일정이 여러 개 있어도 정확한 행을 대상으로 삼기 위한 변경이다.

### 5.6 보안 경계는 프론트엔드 키가 아니라 RLS다

Vite의 `VITE_SUPABASE_ANON_KEY`는 브라우저 번들에 포함되는 공개 클라이언트 키다. 따라서 키를 숨기는 것을 보안 대책으로 설명하면 안 된다. 실제 데이터 보호는 [`20260828000000_secure_schedule_items.sql`](supabase/migrations/20260828000000_secure_schedule_items.sql)의 RLS가 담당한다.

적용한 정책은 다음과 같다.

- `schedule_items`에 RLS 활성화
- `anon`의 테이블 권한 제거
- `authenticated`에 필요한 CRUD 권한만 부여
- SELECT/INSERT/UPDATE/DELETE 모두 `(select auth.uid()) = user_id` 강제
- 새 일정 INSERT 시 `deleted_at is null` 강제
- 활성 일정 조회용 부분 인덱스 추가
- 휴지통 조회용 부분 인덱스 추가

repository에서도 `user_id` 조건을 넣었지만 이것만으로는 보안 경계가 되지 않는다. 클라이언트 코드는 조작될 수 있으므로 DB가 동일한 소유권 규칙을 다시 강제해야 한다.

### 5.7 비밀값은 저장소에서 분리했다

- 실제 `ui/.env`는 Git ignore 대상이며 저장소에 포함되지 않는다.
- 저장소에는 변수명만 있는 [`ui/.env.example`](ui/.env.example)을 커밋했다.
- 프론트엔드에 `service_role` 키를 사용하지 않았다.
- Cloudflare에는 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GTM_ID`를 빌드 환경 변수로 입력했다.

`anon` 키는 공개 가능한 클라이언트 식별자지만, 운영 편의를 위해 실제 값은 문서와 Git에 중복 기록하지 않았다.

### 5.8 GA4/GTM은 동의와 데이터 최소화를 전제로 연동했다

앱은 GA4를 직접 호출하지 않고 허용 목록의 이벤트만 `dataLayer`에 넣어 GTM을 통해 전달한다. 사용자가 분석 수집에 동의하기 전에는 GTM 스크립트 자체를 로드하지 않으며, 설정 화면에서 언제든 동의를 철회할 수 있다.

- 전송 제외: 이메일, 닉네임, 일정 제목·내용, 메모, 파일명, 정확한 목표 시간
- 사용자 구분: 로그인한 경우에만 Supabase UUID를 가명 `user_id`로 사용
- URL 보호: 쿼리 문자열과 해시를 제거한 주소만 `page_location`으로 전송
- 중복 방지: 하나의 GA4 이벤트 태그와 이벤트 허용 목록을 사용

## 6. 배포 구성

GitHub App 권한은 전체 저장소가 아니라 `Virum123/morning_star` 하나에만 부여했다. Cloudflare Pages 설정은 다음과 같다.

| 항목 | 값 |
|---|---|
| Production branch | `main` |
| Framework preset | `None` |
| Root directory | `ui` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| 공개 주소 | `https://morning-star-8a7.pages.dev` |

이제 `main`에 새 커밋이 올라오면 Cloudflare가 자동 빌드·배포한다. 후속 GA4/GTM 연동 커밋이 자동으로 운영 배포되는 것까지 확인했다.

## 7. 요청부터 데이터까지의 실행 흐름

로그인의 실행 흐름은 다음과 같다.

```text
LoginPage
  -> authService.signIn/signUp
  -> Supabase Auth
  -> App의 인증 상태 갱신
  -> 인증된 경우에만 플래너 초기화
```

일정 생성의 실행 흐름은 다음과 같다.

```text
Planner
  -> scheduleService.createSchedule
  -> scheduleMapper가 날짜·bucket·status payload 생성
  -> repository가 현재 user_id를 포함해 INSERT
  -> Postgres RLS가 auth.uid()와 user_id를 검증
  -> 반환 행을 기존 플래너 파일 형태로 매핑
  -> 화면 갱신
```

일정 삭제의 실행 흐름은 다음과 같다.

```text
사용자 삭제
  -> 일정 ID로 대상 지정
  -> deleted_at 기록
  -> 일반 목록에서 제외
  -> 휴지통에서 조회·복원 또는 영구 삭제
```

## 8. 검증 근거

| 검증 | 결과 | 의미 |
|---|---|---|
| `ui/`에서 `npm run lint` | 통과 | React/JavaScript 정적 검사 통과 |
| `ui/`에서 `npm run build` | 통과 | Vite 운영 번들 생성 성공 |
| `python -m unittest tests.test_date_migration` | 10개 통과 | 날짜 경계·레거시 데이터 이동 회귀 방지 |
| `git diff --check` | 통과 | 공백 오류 없음 |
| Supabase SQL Editor 실행 | 사용자 확인 기준 성공 | RLS/정책/인덱스 SQL 실행 완료 |
| Cloudflare Pages 배포 | 성공 | 프로젝트 공개 배포 완료 |
| 공개 주소 HTTP 확인 | `200 OK` | Cloudflare가 HTML을 정상 제공 |
| Tag Assistant | 성공 | GTM과 GA4 태그 실행 확인 |
| GA4 실시간 보고서 | 성공 | 활성 사용자와 `page_view`, `app_open`, `first_visit`, `session_start` 수신 확인 |

분석 연동 배포 후 확인한 Git 상태는 `main`과 `origin/main`이 `eebec90`에서 일치한 상태였다.

## 9. 현재 완료 상태와 아직 검증하지 않은 부분

### 완료

- 로그인 UI 개편
- Supabase 인증 상태 게이트
- 로그인 유지/로그아웃/비밀번호 재설정 코드 경로
- 일정 CRUD와 휴지통 의미 분리
- owner-only RLS 적용
- GitHub `main` 푸시
- Cloudflare Pages 배포
- 공개 URL의 HTTP 200 응답 확인
- GTM 컨테이너 게시와 Cloudflare 자동 재배포 확인
- Tag Assistant 및 GA4 실시간 이벤트 수신 확인

### 아직 확인이 필요한 항목

- Supabase Authentication의 Site URL과 Redirect URL 저장 완료 확인
- 운영 URL에서 회원가입 → 이메일 확인 → 로그인 전체 왕복 테스트
- 운영 URL에서 비밀번호 재설정 메일 → 복귀 → 비밀번호 변경 E2E 테스트
- 서로 다른 두 계정으로 RLS 격리 통합 테스트
- 실제 브라우저에서 주요 플래너 CRUD 시나리오 E2E 테스트

## 10. 기술적 한계와 다음 개선 순서

### 10.1 DB 스키마의 완전한 재현성

현재 마이그레이션은 `schedule_items` 테이블이 이미 존재한다고 가정한다. 테이블 생성 SQL과 제약 조건까지 저장소에 포함해야 새 Supabase 프로젝트에서도 한 번에 복원할 수 있다.

또한 이번 RLS SQL은 SQL Editor에서 수동 실행했다. 파일은 Git에 있지만 Supabase CLI의 migration ledger에는 적용 기록이 없을 수 있으므로, 이후 `supabase migration repair` 또는 표준 `db push` 절차로 이력을 정리해야 한다.

### 10.2 RLS 정책 교체 방식

현재 SQL은 `schedule_items`의 기존 정책을 모두 제거한 뒤 네 개 정책을 다시 만든다. 단일 목적 테이블에서는 명확하지만, 여러 기능이 정책을 공유하게 되면 정책 이름을 지정해 필요한 것만 변경하도록 마이그레이션을 좁혀야 한다.

### 10.3 모든 상태가 클라우드 동기화되는 것은 아니다

일정은 Supabase에 저장되지만 웹의 설정, 활동 기록, 자주 하는 일은 브라우저 `localStorage`에 남아 있다. 또 `ms_fire_days`, 미완료 일정 이전 기록 키는 아직 사용자별 namespace가 아니다.

다음 단계는 둘 중 하나다.

1. 모든 로컬 키를 사용자 ID별로 분리한다.
2. 사용자 설정과 활동 기록용 Supabase 테이블을 만들고 기기 간 동기화한다.

### 10.4 데스크톱과 웹의 기능 동등성

파일 선택, 드래그 앤 드롭, OS 창 제어처럼 Python 호스트가 필요한 기능은 웹에서 동일하게 제공되지 않는다. 현재 구조는 공통 플래너 경험을 우선한 점진적 전환이며 완전한 기능 동등성은 아니다.

### 10.5 테스트 범위

현재 자동화 검증은 ESLint, Vite build, Python 날짜 마이그레이션 테스트가 중심이다. React 단위 테스트, 브라우저 E2E, Supabase 로컬 환경 기반 RLS 테스트, CI 파이프라인을 추가해야 한다.

### 10.6 UX 미완료 기능

로그인 화면의 “이메일 찾기”는 현재 본인 확인 수단이 필요하다는 안내만 표시한다. 실제 계정 복구 기능으로 설명하면 안 된다.

### 10.7 번들 크기

Vite 빌드는 성공했지만 500KB를 넘는 JavaScript chunk 경고가 있었다. 화면 단위 lazy loading과 의존성 분할을 적용하면 초기 다운로드 비용을 줄일 수 있다.

### 10.8 무료 운영의 정확한 의미

Cloudflare의 정적 자산은 현재 무료로 제공되며 로컬 PC를 켜 둘 필요가 없다. 그러나 “영구적이고 무제한인 무료 서버”라고 표현하면 부정확하다.

- Cloudflare와 Supabase의 무료 정책·한도는 변경될 수 있다.
- Supabase Free 프로젝트는 활동이 적으면 약 7일 기준으로 일시 정지될 수 있다.
- 중단 없는 운영을 보장하려면 Supabase 유료 플랜 또는 별도의 운영 전략이 필요하다.
- 공개 회원가입을 운영한다면 Supabase 기본 메일 발송 대신 custom SMTP와 abuse 방지 정책도 검토해야 한다.

## 11. 면접에서 받을 수 있는 질문과 답변

### Q1. 왜 기존 앱을 웹용으로 전면 재작성하지 않았나요?

기존 일간·주간·월간 UI가 Markdown 파일 구조를 공유하고 있어 전면 재작성의 회귀 범위가 컸습니다. repository/service/mapper 어댑터를 추가해 저장소만 Supabase로 교체하고 화면 계약은 유지했습니다. 짧은 기간에 배포 가능성을 확보하는 데 유리했고, 장기적으로는 중간 파일 모델을 제거하는 리팩터링이 필요합니다.

### Q2. 브라우저에 Supabase anon key가 보이면 보안 문제가 아닌가요?

anon key는 브라우저 사용을 전제로 한 공개 클라이언트 키입니다. 이 키만으로 다른 사용자의 데이터를 읽을 수 없도록 DB RLS가 `auth.uid() = user_id`를 강제합니다. 서버 권한을 우회하는 `service_role` 키는 프론트엔드에 절대 넣지 않았습니다.

### Q3. repository에서도 `user_id`를 검사하는데 RLS가 또 필요한 이유는 무엇인가요?

repository 조건은 정상 클라이언트의 실수를 줄이는 방어이고, RLS는 조작된 요청까지 막는 실제 권한 경계입니다. 브라우저 코드는 사용자가 변경할 수 있기 때문에 DB 레벨 검증이 반드시 필요합니다.

### Q4. 왜 soft delete와 hard delete를 나눴나요?

사용자의 실수는 복구할 수 있어야 하지만, 편집 동기화 과정에서 생긴 불필요한 trailing row까지 휴지통에 쌓이면 UX가 오염됩니다. 그래서 사용자 동작은 soft delete, 명시적인 휴지통 비우기와 내부 정리는 hard delete로 분리했습니다.

### Q5. 데스크톱과 웹을 한 코드베이스에서 어떻게 구분했나요?

`window.pywebview?.api`를 capability로 사용했습니다. 객체가 있으면 Python 호스트 API를 호출하고, 없으면 브라우저 저장소나 Supabase 경로를 사용합니다. 운영 HTTP 환경은 `pywebview`를 기다리지 않고 즉시 초기화합니다.

### Q6. “항상 켜진 무료 서버”를 만든 것인가요?

정확히는 별도 서버 프로세스를 운영한 것이 아니라 Cloudflare Pages의 정적 호스팅과 Supabase의 관리형 Auth/Postgres를 조합한 서버리스 구조입니다. 프론트엔드는 로컬 PC와 무관하게 제공되지만 Supabase Free는 비활성 시 일시 정지될 수 있어 무중단 SLA를 보장하지는 않습니다.

### Q7. 가장 먼저 추가할 테스트는 무엇인가요?

두 사용자를 생성해 각자의 일정만 조회·수정·삭제되는지 확인하는 RLS 통합 테스트와, 회원가입·로그인·비밀번호 재설정·휴지통 복원을 다루는 브라우저 E2E 테스트를 우선하겠습니다.

## 12. 1분 발표 예시

> Morning Star는 원래 Python pywebview와 React로 만든 로컬 Markdown 플래너였습니다. 저는 기존 화면을 버리지 않고 웹으로 확장하기 위해 repository, service, mapper 계층을 추가했고, Supabase 일정 행을 기존 플래너가 이해하는 형태로 변환했습니다. 인증은 Supabase Auth로 구현하고 로그인 유지 여부에 따라 localStorage와 sessionStorage를 선택하도록 했습니다. 브라우저 키는 숨길 수 없기 때문에 보안 경계는 Postgres RLS로 두었고, 로그인 사용자가 자기 user_id의 행만 CRUD할 수 있게 정책을 적용했습니다. 삭제는 사용자 복구를 위한 soft delete와 내부 정리용 hard delete로 분리했습니다. 마지막으로 GitHub main을 Cloudflare Pages에 연결해 자동 빌드되도록 구성했고 실제 공개 URL의 HTTP 200 응답까지 확인했습니다. 현재 남은 과제는 인증 E2E와 두 사용자 RLS 통합 테스트, 전체 DB 스키마의 마이그레이션 코드화입니다.

## 13. 관련 파일

- [`ui/src/App.jsx`](ui/src/App.jsx): 인증 게이트, 복구 모드, 웹/데스크톱 초기화, 로그아웃
- [`ui/src/components/LoginPage.jsx`](ui/src/components/LoginPage.jsx): 로그인·회원가입·재설정 UI와 상태
- [`ui/src/components/LoginPage.css`](ui/src/components/LoginPage.css): 로그인 화면 스타일
- [`ui/src/lib/supabaseClient.js`](ui/src/lib/supabaseClient.js): Supabase 클라이언트와 세션 storage 어댑터
- [`ui/src/services/authService.js`](ui/src/services/authService.js): 인증 API 래퍼
- [`ui/src/services/scheduleService.js`](ui/src/services/scheduleService.js): 일정 동기화·화면 호환 로직
- [`ui/src/repositories/supabaseScheduleRepository.js`](ui/src/repositories/supabaseScheduleRepository.js): 사용자별 일정 CRUD와 휴지통
- [`ui/src/utils/scheduleMapper.js`](ui/src/utils/scheduleMapper.js): DB 행과 플래너 표현 변환
- [`ui/src/utils/api.js`](ui/src/utils/api.js): pywebview API와 브라우저 fallback
- [`ui/src/utils/analytics.js`](ui/src/utils/analytics.js): 동의 기반 GTM 로더와 이벤트 허용 목록
- [`ui/src/components/AnalyticsConsent.jsx`](ui/src/components/AnalyticsConsent.jsx): 분석 수집 동의 UI
- [`ui/ANALYTICS_SETUP.md`](ui/ANALYTICS_SETUP.md): GA4/GTM 구성 및 개인정보 보호 기준
- [`supabase/migrations/20260828000000_secure_schedule_items.sql`](supabase/migrations/20260828000000_secure_schedule_items.sql): RLS 정책과 인덱스
- [`tests/test_date_migration.py`](tests/test_date_migration.py): 날짜 이동 회귀 테스트

## 14. 참고 문서

- [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Cloudflare Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Cloudflare Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Auth Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
