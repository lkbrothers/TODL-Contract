require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { ethers } = require("hardhat");
const logger = require('./logger');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 대기 함수
async function waitIfNeeded() {
    if(process.argv.length > 2) {
        logger.info("⏳ 다음 tx를 위해 1초 대기...");
        await sleep(1000);
    }
}

async function main() {
    logger.info("🚀 라운드 메니저 시작...");

    // 환경변수 확인
    const adminKey = process.env.ADMIN_KEY;
    const markerKey = process.env.MARKER_KEY;
    const providerUrl = process.env.PROVIDER_URL;

    if (!adminKey || !markerKey || !providerUrl) {
        throw new Error("❌ .env 파일에 ADMIN_KEY, MARKER_KEY, PROVIDER_URL을 설정해야 합니다.");
    }

    // Provider 및 지갑 설정
    const provider = new ethers.JsonRpcProvider(providerUrl);
    const adminWallet = new ethers.Wallet(adminKey, provider);
    const userWallet = new ethers.Wallet(markerKey, provider);

    logger.info("📋 환경변수 확인:", {
        adminAddress: adminWallet.address,
        userAddress: userWallet.address,
        provider: providerUrl
    });

    while(true) {
        try {
            // 배포 정보 로드
            const deploymentInfo = require('./output/deployment-info.json');
            const mainAddress = deploymentInfo.contracts.main;
            const rngAddress = deploymentInfo.contracts.rng;

            logger.info("📋 컨트랙트 주소:", {
                main: mainAddress,
                rng: rngAddress
            });

            // 컨트랙트 ABI 로드
            const MainArtifact = require('../artifacts/contracts/Main.sol/Main.json');
            const RngArtifact = require('../artifacts/contracts/Rng.sol/Rng.json');

            // 컨트랙트 인스턴스 생성
            const main = new ethers.Contract(mainAddress, MainArtifact.abi, provider);
            const rng = new ethers.Contract(rngAddress, RngArtifact.abi, provider);

            // RNG 컨트랙트 정보 확인
            const signerAddr = await rng.signerAddr();
            logger.info("📋 RNG 컨트랙트 정보:", {
                signerAddress: signerAddr,
                adminAddress: adminWallet.address,
                signerMatch: signerAddr === adminWallet.address
            });

            // 1. startRound (ADMIN_KEY 사용)
            logger.info("1️⃣ startRound 실행 중...");
            
            // 현재 라운드 ID 확인
            const currentRoundId = await main.roundId();
            const roundId = currentRoundId + 1n;
            const randSeed = 5; // Main.test.js와 동일한 값

            logger.info(`📊 현재 라운드 ID: ${currentRoundId}, 새 라운드 ID: ${roundId}`);

            // EIP-712 시그니처 생성
            const rngDomain = {
                name: 'Custom-Rng',
                version: '1',
                chainId: await provider.getNetwork().then(n => n.chainId),
                verifyingContract: rngAddress
            };
            
            const rngTypes = {
                SigData: [
                    { name: 'roundId', type: 'uint256' },
                    { name: 'randSeed', type: 'uint256' }
                ]
            };
            
            const rngMessage = {
                roundId: roundId,
                randSeed: randSeed
            };
            
            const rngSignature = await adminWallet.signTypedData(rngDomain, rngTypes, rngMessage);
            logger.info("✅ EIP-712 시그니처 생성 완료");

            // startRound 호출
            const startRoundTx = await main.connect(adminWallet).startRound(rngSignature);
            await startRoundTx.wait();
            logger.info("✅ startRound 완료:", { hash: startRoundTx.hash });
            await waitIfNeeded();

            // 라운드 상태 확인
            const roundStatus = await main.getRoundStatus(roundId);
            logger.info(`📊 라운드 ${roundId} 상태: ${getStatusName(roundStatus)}`);

            await sleep(40 * 1000)

            // 2. closeTicketRound (PRIVATE_KEY 사용)
            logger.info("2️⃣ closeTicketRound 실행 중...");
            const closeTicketTx = await main.connect(userWallet).closeTicketRound();
            await closeTicketTx.wait();
            logger.info("✅ closeTicketRound 완료:", { hash: closeTicketTx.hash });
            await waitIfNeeded();

            await sleep(1000);

            // 라운드 상태 확인
            const roundStatusAfterClose = await main.getRoundStatus(roundId);
            logger.info(`📊 라운드 ${roundId} 상태: ${getStatusName(roundStatusAfterClose)}`);

            await sleep(5 * 1000)

            // 3. settleRound (ADMIN_KEY 사용)
            logger.info("3️⃣ settleRound 실행 중...");
            const settleRoundTx = await main.connect(adminWallet).settleRound(randSeed);
            await settleRoundTx.wait();
            logger.info("✅ settleRound 완료:", { hash: settleRoundTx.hash });
            await waitIfNeeded();

            await sleep(1000);

            // 최종 라운드 상태 확인
            const finalRoundStatus = await main.getRoundStatus(roundId);
            logger.info(`📊 라운드 ${roundId} 최종 상태: ${getStatusName(finalRoundStatus)}`);

            // 라운드 정보 출력
            logger.info("📋 라운드 정보:", {
                roundId: roundId.toString(),
                finalStatus: getStatusName(finalRoundStatus),
                randomSeed: randSeed
            });

        } catch (error) {
            logger.error("❌ 테스트 중 오류가 발생했습니다:", error);
            await sleep(1000);
        }
    }
}

function getStatusName(status) {
    const statusNames = ['NotStarted', 'Proceeding', 'Drawing', 'Claiming', 'Refunding', 'Ended'];
    return statusNames[status] || `Unknown(${status})`;
}

// 스크립트 실행
main()
    .then(() => {
        logger.info("🎯 RoundManager 종료");
        process.exit(0);
    })
    .catch((error) => {
        logger.error("❌ RoundManager 실패:", error);
        process.exit(1);
    }); 