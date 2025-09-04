# TODL-Contract

TODL 프로젝트의 스마트 컨트랙트 코드입니다.

## 📋 컨트랙트 목록

- **Main**: 메인 컨트랙트 (라운드 관리, 전체 시스템 조율)
- **ItemParts**: NFT 파츠 컨트랙트 (부위별 파츠 NFT)
- **Agent**: 에이전트 NFT 컨트랙트
- **Rng**: 난수 생성 컨트랙트
- **RewardPool**: 보상 풀 컨트랙트
- **StakePool**: 스테이킹 풀 컨트랙트
- **Reserv**: 예약 컨트랙트
- **SttPermit**: Token 토큰 컨트랙트

## 🚀 배포

### 모든 컨트랙트 배포

```bash
# 기본 배포 (모든 주소를 배포자로 설정)
npx hardhat run ./scripts/deployContract.js

# 환경변수를 사용한 배포
ADMIN_ADDRESS=0x... CARRIER_ADDRESS=0x... DONATE_ADDRESS=0x... \
CORPORATE_ADDRESS=0x... OPERATION_ADDRESS=0x... \
npx hardhat run ./scripts/deployContract.js --network <network-name>
```

### 배포 결과

배포가 완료되면 `deployment-info.json` 파일이 생성되어 배포된 컨트랙트 주소들이 저장됩니다.

## 🧪 테스트

```bash
# 모든 테스트 실행
npx hardhat test

# 특정 컨트랙트 테스트 실행
npx hardhat test test/ItemParts.test.js
npx hardhat test test/Agent.test.js
npx hardhat test test/Rng.test.js
npx hardhat test test/RewardPool.test.js
npx hardhat test test/StakePool.test.js
npx hardhat test test/Reserv.test.js
```

## 📁 프로젝트 구조

```
TODL-Contract/
├── contracts/          # 스마트 컨트랙트 소스 코드
├── test/              # 테스트 파일들
├── scripts/           # 배포 스크립트
├── hardhat.config.js  # Hardhat 설정
└── README.md         # 프로젝트 문서
```

## 🔧 개발 환경 설정

```bash
# 의존성 설치
npm install

# 컴파일
npx hardhat compile

# 로컬 네트워크 실행
npx hardhat node
```
