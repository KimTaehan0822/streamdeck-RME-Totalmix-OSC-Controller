# RME TotalMix – Stream Deck 플러그인

**한국어** | [English](README.en.md) | [日本語](README.ja.md)

Elgato Stream Deck의 키와 다이얼로 **RME TotalMix FX**를 조작하는 플러그인입니다. 페이더, 뮤트, 솔로, 게인, FX, 스냅샷을 키 하나로 다루고, 키와 다이얼 화면에서 레벨 미터를 볼 수 있습니다. TotalMix의 **Global OSC**로 직접 통신하므로 다른 프로그램은 필요 없습니다.

## 다운로드

[최신 릴리즈](https://github.com/KimTaehan0822/streamdeck-rme-totalmix-OSC/releases/latest) 페이지에서 `RME-TotalMix-StreamDeck-v<버전>.zip`을 받아 압축을 풉니다. 안에 들어 있는 파일은 아래와 같습니다.

- `RME-TotalMix.streamDeckPlugin`: 설치 파일
- 사용설명서 PDF (언어별로 하나씩)
  - `RME TotalMix 스트림덱 플러그인 사용설명서.pdf`: 한국어
  - `RME TotalMix Stream Deck Plugin Manual (English).pdf`: 영어
  - `RME TotalMix Stream Deck プラグイン 取扱説明書 (日本語).pdf`: 일본어
- `THIRD-PARTY-NOTICES.txt`: 함께 쓰인 오픈소스 고지

## 필요한 것

- Windows
- Stream Deck 소프트웨어 7.3 이상
- **TotalMix FX 2.1 이상**: Global OSC가 필요하며, 이전 버전은 지원하지 않습니다.
- 다이얼 액션을 쓰려면 Stream Deck +가 필요합니다. 키 액션은 모든 Stream Deck에서 쓸 수 있습니다.

## 빠른 시작

### 1. 플러그인 설치

`RME-TotalMix.streamDeckPlugin`을 더블클릭하고, Stream Deck 소프트웨어가 설치할지 물으면 승인합니다.

### 2. TotalMix에서 OSC 켜기

1. **Options → Enable OSC Control**을 켭니다. 이 스위치가 꺼져 있으면 TotalMix가 OSC를 전혀 받지 않습니다.
2. OSC 설정에서 **incoming 포트를 7001**, **outgoing 포트를 9001**로 맞춥니다.
3. **Remote Controller Address → IP or Host Name**에 `127.0.0.1`을 넣습니다. TotalMix와 Stream Deck이 같은 PC일 때의 값입니다. Windows에서는 이 칸이 비어 있으면 TotalMix가 상태를 돌려보내지 않습니다.
4. **Compatibility (Mode)**에서 **Global OSC**를 고르고 **Details**를 열어 아래처럼 맞춥니다.

| TotalMix 항목 | 설정 |
| --- | --- |
| Send changes | 켬 (필수) |
| Send all data on start | 끔 |
| Send status | 켬 (권장) |
| Re-send received | 켬 (권장) |
| Send faders in linear scale | 아무거나 (둘 다 지원) |

5. 레벨 미터를 보려면 OSC 메인 설정에서 **Send Peak Level Data**를 켜고 **Peak Hold**는 끕니다.

### 3. 첫 키 만들기

1. Stream Deck 소프트웨어의 액션 목록에서 **RME TotalMix OSC Controller** 카테고리를 엽니다.
2. 예를 들어 **Fader(2-Button)** 를 키 두 개에 끌어다 놓습니다. 하나는 올리기, 하나는 내리기로 정하고 같은 채널을 고릅니다.
3. 채널 목록은 TotalMix에 연결되기 전에는 1~48 번호로 보이고, 연결되면 실제 채널 이름으로 바뀝니다.

## 연결 설정 (포트)

아무 액션이나 고른 뒤 설정 화면 맨 아래의 **▸ TotalMix connection (OSC)** 를 펼칩니다. 이 설정은 모든 액션이 함께 씁니다.

| 항목 | 기본값 |
| --- | --- |
| Host | `127.0.0.1` |
| TotalMix port | `7001` |
| Feedback port | `9001` |
| Sync timeout (ms) | `500` |

**OSC 포트가 다른 프로그램과 겹치는 경우**, 예를 들어 Bitfocus Companion의 TotalMix 모듈처럼 같은 포트를 쓰는 프로그램을 함께 켜 둔다면, 포트를 바꿔 주세요. TotalMix에서 두 번째 OSC 리모트를 켜서 다른 포트(예: incoming 7002 / outgoing 9002)를 정하고, 위 **TotalMix port**와 **Feedback port**에도 같은 번호를 넣으면 됩니다. 포트를 바꾸면 Stream Deck을 다시 시작하지 않아도 적용됩니다.

## 설정 화면 언어

설정 화면 맨 아래의 **▸ Language**를 펼쳐 **English / 한국어 / 日本語** 중에서 고릅니다. 고르는 즉시 설정 화면의 글자가 바뀌고, 모든 액션에 똑같이 적용됩니다. 처음 값은 English입니다. 키에 뜨는 글자(OFFLINE 등)와 액션 목록의 이름은 바뀌지 않습니다.

## 액션 목록

**채널 키**

| 액션 | 하는 일 |
| --- | --- |
| Mute / Solo | 채널 뮤트, 솔로 |
| Input option | 48V, Inst, Pad, AutoSet 켜기/끄기 |
| Output loopback | 출력 루프백 켜기/끄기 |
| Group | 그룹 설정, 토글 |

**값 조절 키** (누르고 있으면 반복합니다)

| 액션 | 하는 일 |
| --- | --- |
| Fader(2-Button) | 키 두 개로 페이더 올리기/내리기. 키에 레벨 미터 표시 |
| Fader | 페이더를 정한 값으로 설정하거나 정한 만큼 올리기/내리기 |
| Pan | 팬 설정 또는 조절 |
| Input gain | 입력 게인 올리기/내리기 |
| Global FX (Reverb / Echo) | 글로벌 리버브, 에코 켜기/끄기 |
| FX parameter | FX 파라미터 설정 또는 조절 |

**다이얼 (Stream Deck +)**

| 액션 | 돌리면 | 누르면 |
| --- | --- | --- |
| VU Dial | 페이더 조절, 레벨 미터 표시 | 뮤트 (바꿀 수 있음) |
| Pan Dial | 팬 조절 | 가운데로 |
| Gain Dial | 게인 조절 | 뮤트, 48V, Pad 등 중 고른 기능 |
| FX Parameter Dial | FX 파라미터 조절 | 초기값으로 |

VU Dial은 설정 화면의 **▸ Press actions**에서 누르기와 누른 채 왼쪽·오른쪽으로 돌리기에 다른 동작(뮤트 켜기/끄기, 정한 볼륨으로 복귀 등)을 고를 수 있습니다.

**전역 키**

| 액션 | 하는 일 |
| --- | --- |
| Snapshot | 스냅샷을 번호로 불러오기 |
| Control Room | 컨트롤룸 기능 |
| Layout preset / TotalMix window | 화면 레이아웃, 창 전환 |

각 액션의 자세한 옵션은 함께 들어 있는 PDF 사용설명서를 보세요.

## 키에 뜨는 표시

| 표시 | 뜻 | 할 일 |
| --- | --- | --- |
| **OFFLINE** | TotalMix가 응답하지 않음 | TotalMix 실행, Enable OSC Control, 포트, 방화벽 확인 |
| **N/A** | 이 장치에 없는 기능 | 예: 48V가 없는 입력. 다른 채널을 고르세요 |
| **SET CHANNEL** | 채널을 아직 고르지 않음 | 설정 화면에서 채널 선택 |
| **SETUP** | 다른 필수 설정이 비어 있음 | 설정 화면에서 입력 |

## 문제 해결

- **계속 OFFLINE이에요:** TotalMix의 OSC 포트와 플러그인의 TotalMix port / Feedback port가 서로 맞는지 확인하세요. 다른 프로그램이 같은 포트를 쓰고 있다면 위 "연결 설정"처럼 포트를 바꾸세요.
- **레벨 미터가 움직이지 않아요:** TotalMix에서 Send Peak Level Data가 켜져 있는지 확인하세요.
- **키를 누르고 있지 않은데 계속 반복돼요:** 그 키를 한 번 더 누르면 멈춥니다. Multi Action 안에서는 반복하지 않고 한 번만 동작합니다.

## 직접 빌드하기

```bash
npm install
npm run pack
```

`npm run pack`을 실행하면 `.streamDeckPlugin` 파일이 만들어집니다.

## 고지

이 플러그인이 사용하는 오픈소스의 라이선스는 `THIRD-PARTY-NOTICES.txt`에 있습니다. RME, TotalMix는 RME Audio의 상표이며, 이 플러그인은 RME와 관계없는 비공식 프로젝트입니다.
