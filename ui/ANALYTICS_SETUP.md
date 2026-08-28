# GA4 / GTM 연동 설정

Morning Star는 앱에서 GA4를 직접 호출하지 않고, `dataLayer → Google Tag Manager → GA4` 한 경로로만 이벤트를 전송합니다. 사용자가 허용하기 전에는 GTM 스크립트도 로드하지 않습니다.

## 1. Google 쪽 설정

1. GA4에서 `Morning Star` 속성과 웹 데이터 스트림을 만들고 `G-...` 측정 ID를 확인합니다.
2. GTM에서 웹 컨테이너를 만들고 `GTM-...` 컨테이너 ID를 확인합니다.
3. GTM에 다음 데이터 영역 변수를 만듭니다.

   - `analytics_user_id`
   - `page_location`
   - `page_title`
   - `tab_name`
   - `checked`
   - `target`
   - `count`
   - `target_time_count`
   - `theme_mode`
   - `color_theme`
   - `app_language`

4. GTM에 Google 태그를 만들고 태그 ID로 GA4의 `G-...`를 입력합니다. 구성 매개변수는 다음처럼 지정합니다.

   - `send_page_view`: `false`
   - `page_location`: `{{DLV - page_location}}`
   - `page_title`: `{{DLV - page_title}}`
   - `user_id`: `{{DLV - analytics_user_id}}`

   트리거는 `Initialization - All Pages`를 사용합니다. `page_location`은 쿼리와 해시를 제거한 주소만 앱에서 전달하므로 인증 콜백 값이 GA4로 넘어가지 않습니다.

5. GA4 이벤트 태그 하나를 만들고 이벤트 이름에 GTM 기본 변수 `{{Event}}`를 사용합니다. 필요한 이벤트 매개변수에는 3번의 데이터 영역 변수를 연결합니다.
6. Custom Event 트리거를 정규식 모드로 만들고 다음 허용 이벤트만 지정합니다.

   ```text
   ^(page_view|app_open|tab_view|onboarding_view|task_check_planner|task_quick_add|task_inline_edit|task_migrate|freq_tasks_deleted_bulk|freq_tasks_added_daily|no_task_fire|fire_complete|settings_save)$
   ```

7. GTM Preview와 GA4 DebugView에서 확인한 뒤 컨테이너를 게시합니다. 같은 이벤트를 위한 개별 태그를 추가하면 중복 집계될 수 있으므로 위의 단일 이벤트 태그만 사용합니다.

## 2. 앱과 Cloudflare 설정

로컬 `ui/.env`와 Cloudflare Pages의 Production 환경 변수에 다음 값을 추가합니다.

```dotenv
VITE_GTM_ID=GTM-XXXXXXX
```

Vite 환경 변수는 빌드 시 번들에 들어가므로 Cloudflare 변수 저장 후 새 배포가 필요합니다. GTM 컨테이너 ID는 공개 식별자이며 비밀키가 아닙니다.

## 3. 개인정보 보호 동작

- 동의 전/거부 상태: GTM 미로드, 앱 이벤트 미전송
- 허용 상태: GTM을 한 번만 로드하고 허용 목록의 이벤트만 전송
- 설정 화면: 현재 브라우저에서 허용/거부를 언제든 변경 가능
- 전송 제외: 이메일, 닉네임, 일정 제목·내용, 메모, 파일명, 정확한 목표 시간
- 사용자 구분: 로그인한 경우에만 Supabase UUID를 가명 `user_id`로 사용하며 이메일과 결합하지 않음
