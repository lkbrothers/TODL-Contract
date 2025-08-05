# TODL 벤치마크 테스트

이 폴더는 TODL 프로젝트의 성능 및 기능 테스트를 위한 벤치마크 스크립트들을 포함합니다.

## 벤치마크 목록

### 1. 라운드 시뮬레이션 (benchmark_01_round_simulation.js)

**목적**: 실제 사용 패턴을 반영한 라운드 시뮬레이션

**시나리오**:
- 100개 주소에 1 ETH, 10 STT씩 입금
- 라운드 시작
- 각 주소별로 ItemParts 10회 민팅 (최대 50개까지)
- 부위별로 배열을 만들고 가장 짧은 부위 기준으로 Agent 구매
- 주소별 Agent 생성 개수 통계

**실행 방법**:
```bash
npx hardhat test benchmarks/benchmark_01_round_simulation.js
```

**예상 결과**:
- 평균적으로 몇 개의 Agent가 생성되는지 분석
- 하루 최대 50개 ItemParts 제한으로 인한 실제 Agent 생성률
- 파츠 분포 및 사용자별 성공률 통계

## 벤치마크 실행 전 준비사항

1. **의존성 설치**:
```bash
npm install
```

2. **컨트랙트 컴파일**:
```bash
npx hardhat compile
```

3. **환경 설정**:
```bash
cp env.example .env
# .env 파일에서 필요한 설정 수정
```

## 벤치마크 결과 해석

### 주요 지표

1. **Agent 생성률**: 사용자당 평균 생성된 Agent 수
2. **성공률**: Agent 생성에 성공한 사용자 비율
3. **파츠 분포**: 각 부위별 민팅된 ItemParts 분포
4. **실행 시간**: 전체 벤치마크 소요 시간

### 예상 시나리오

- **최적 시나리오**: 모든 사용자가 10개씩 ItemParts를 민팅하고, 부위별 균등 분포로 최대 10개 Agent 생성
- **현실적 시나리오**: 파츠 분포의 불균형으로 인해 평균 3-5개 Agent 생성
- **최악 시나리오**: 특정 부위가 부족하여 평균 1-2개 Agent 생성

## 추가 벤치마크 계획

1. **대량 사용자 시뮬레이션**: 1000명 이상의 사용자로 확장
2. **가스 효율성 테스트**: 다양한 배치 크기로 가스 사용량 측정
3. **스트레스 테스트**: 동시 요청 처리 능력 테스트
4. **메모리 사용량 테스트**: 대량 데이터 처리 시 메모리 사용량 분석

## 문제 해결

### 일반적인 문제들

1. **가스 부족**: `--gas-limit` 옵션으로 가스 한도 증가
2. **타임아웃**: `--timeout` 옵션으로 타임아웃 시간 증가
3. **메모리 부족**: Node.js 메모리 한도 증가 (`--max-old-space-size`)

### 실행 예시

```bash
# 기본 실행
npx hardhat test benchmarks/benchmark_01_round_simulation.js

# 상세 로그와 함께 실행
npx hardhat test benchmarks/benchmark_01_round_simulation.js --verbose

# 가스 한도 증가하여 실행
npx hardhat test benchmarks/benchmark_01_round_simulation.js --gas-limit 30000000
``` 