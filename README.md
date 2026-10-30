# RME TotalMix – Stream Deck 플러그인

Stream Deck(특히 Stream Deck + / XL)에서 RME TotalMix FX를 **Global OSC**로 바로 조작하는 플러그인입니다. Companion은 필요 없습니다.

## Requirements (필요한 것)

- Windows, Stream Deck 소프트웨어 7.3 이상
- **TotalMix FX 2.1 이상** (Global OSC 필요, 이전 버전은 지원하지 않습니다)
- **Companion의 TotalMix 모듈은 먼저 꺼 주세요.** 같은 포트(7001, 9001)를 쓰기 때문에 둘이 동시에 켜져 있으면 충돌합니다.

## Install (설치)

1. `.streamDeckPlugin` 파일을 더블클릭합니다.
2. Stream Deck 소프트웨어가 설치 여부를 물으면 승인합니다.
3. 액션 목록에서 **RME TotalMix** 카테고리를 찾아 키/다이얼에 끌어다 놓습니다.

(직접 만들 때: `npm install`, `npm run bundle`, `npm run pack` → `.streamDeckPlugin` 생성)

## TotalMix OSC settings (TotalMix 설정)

1. **Options → Enable OSC Control** 을 켭니다. 이 스위치가 꺼져 있으면 TotalMix가 OSC를 전혀 받지 않습니다.
2. OSC 리모트의 **incoming 포트 = 7001**, **outgoing 포트 = 9001** 로 맞춥니다.
3. **Remote Controller Address → IP or Host Name** 에 `127.0.0.1`(같은 PC일 때)을 넣습니다. Windows에서는 이 칸이 비어 있으면 TotalMix가 상태(피드백)를 보내지 않습니다.
4. **Compatibility (Mode)** 에서 **Global OSC** 를 고르고 **Details** 를 엽니다.

| TotalMix 항목 | 설정 |
| --- | --- |
| Send changes | 켬 (필수) |
| Send all data on start | 끔 |
| Send status | 켬 (권장) |
| Re-send received | 켬 (권장) |
| Send faders in linear scale | 선택 (플러그인은 선형/dB 둘 다 받음) |

5. VU 미터를 쓰려면 OSC 메인 설정에서 **Send Peak Level Data** 를 켜고 **Peak Hold** 는 끕니다. 미터 데이터는 트래픽이 많으니 필요할 때만 켜세요.

## Plugin settings (플러그인 설정)

아무 액션이나 눌러서 오른쪽 Property Inspector 맨 위의 공통 항목에 입력합니다 (모든 액션에 공유).

| 항목 | 기본값 |
| --- | --- |
| Host | `127.0.0.1` |
| TotalMix port | `7001` |
| Feedback port | `9001` |
| Sync timeout (ms) | `500` |

포트를 바꾸면 Stream Deck을 다시 시작하지 않아도 적용됩니다.

## Actions (액션)

채널 선택 목록은 TotalMix에 연결되기 전에는 **1..48 번호 목록**으로 보입니다. 연결되면 실제 채널 이름으로 바뀝니다.

**채널 키**
- Mute / Solo: 채널 뮤트, 솔로
- Input option: 48V, Inst, Pad, AutoSet
- Output loopback: 출력 루프백
- Group: 그룹 설정/토글

**페이더 / 값 조절 키**
- Fader(2-Button): 두 키로 페이더 올리기/내리기 프리셋 (누르고 있으면 반복)
- Fader: 페이더를 정한 값으로 설정(Set) 하거나 정한 값만큼 올리기/내리기(Step, 누르고 있으면 반복)
- Pan: 팬 설정 또는 Step으로 조절 (Step은 누르고 있으면 반복)
- Input gain: 입력 게인 올리기/내리기 (누르고 있으면 반복)
- Global FX (Reverb / Echo): 글로벌 FX 켜기/끄기
- FX parameter: FX 파라미터 설정 또는 Step으로 조절 (Step은 누르고 있으면 반복)

반복이 멈추지 않으면 그 키를 한 번 더 누르면 멈춥니다. Multi Action 안에서는 반복하지 않고 한 번만 동작합니다.

**다이얼 (Stream Deck +)**
- VU Dial: 돌리면 페이더 ±1 dB, 누르면 뮤트, 레벨 미터 표시. **Touch tap mutes** 옵션(기본 켜짐)을 끄면 화면 터치로는 뮤트되지 않습니다.
- Pan Dial: 돌리면 팬, 누르면 가운데
- Gain Dial: 돌리면 게인, 누르면 AutoSet
- FX Parameter Dial: 돌리면 FX 파라미터, 누르면 초기값

**전역 키**
- Snapshot: 스냅샷 **번호**로 불러오기 (TotalMix OSC에는 스냅샷 이름이 없습니다)
- Control Room: 컨트롤룸 기능
- Layout preset, TotalMix window: 화면 레이아웃과 창 전환

## Key hints (키에 뜨는 표시)

- **OFFLINE**: TotalMix에서 응답이 없음 (실행 여부, Enable OSC Control, 포트, 방화벽 확인)
- **N/A**: 이 장치가 지원하지 않는 기능 (예: 48V 없는 입력)
- **SET CHANNEL**: 채널을 아직 고르지 않음
- **SETUP**: 다른 필수 설정이 비어 있음 (Property Inspector에서 입력)
