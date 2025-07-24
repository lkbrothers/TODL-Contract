require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { ethers } = require("hardhat");

async function main() {
    console.log("🚀 Commit-Reveal 테스트를 시작합니다...");

    // 환경변수 확인
    const adminKey = process.env.ADMIN_KEY;
    const privateKey = process.env.MARKER_KEY;
    const providerUrl = process.env.PROVIDER_URL;

    if (!adminKey || !privateKey || !providerUrl) {
        throw new Error("❌ .env 파일에 ADMIN_KEY, PRIVATE_KEY, PROVIDER_URL을 설정해야 합니다.");
    }

    // Provider 및 지갑 설정
    const provider = new ethers.JsonRpcProvider(providerUrl);
    const adminWallet = new ethers.Wallet(adminKey, provider);
    const userWallet = new ethers.Wallet(privateKey, provider);

    console.log("📋 테스트 설정:");
    console.log("  - Admin Address:", adminWallet.address);
    console.log("  - User Address:", userWallet.address);
    console.log("  - Provider:", providerUrl);

    try {
        // 배포 정보 로드
        const deploymentInfo = require('../output/deployment-info.json');
        const mainAddress = deploymentInfo.contracts.main;
        const rngAddress = deploymentInfo.contracts.rng;

        console.log("📋 컨트랙트 주소:");
        console.log("  - Main:", mainAddress);
        console.log("  - Rng:", rngAddress);

        // 컨트랙트 ABI 로드
        const MainArtifact = require('../../artifacts/contracts/Main.sol/Main.json');
        const RngArtifact = require('../../artifacts/contracts/Rng.sol/Rng.json');

        // 컨트랙트 인스턴스 생성
        const main = new ethers.Contract(mainAddress, MainArtifact.abi, provider);
        const rng = new ethers.Contract(rngAddress, RngArtifact.abi, provider);

        // Sleep 함수 정의
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // RNG 컨트랙트 정보 확인
        const signerAddr = await rng.signerAddr();
        console.log("📋 RNG 컨트랙트 정보:");
        console.log("  - Signer Address:", signerAddr);
        console.log("  - Admin Address:", adminWallet.address);
        console.log("  - Signer 일치 여부:", signerAddr === adminWallet.address);

        // 1. startRound (ADMIN_KEY 사용)
        console.log("\n1️⃣ startRound 실행 중...");
        
        // 현재 라운드 ID 확인
        const currentRoundId = await main.roundId();
        const roundId = currentRoundId + 1n;
        const randSeed = 5; // Main.test.js와 동일한 값

        console.log(`📊 현재 라운드 ID: ${currentRoundId}, 새 라운드 ID: ${roundId}`);

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
        console.log("✅ EIP-712 시그니처 생성 완료");

        // startRound 호출
        const startRoundTx = await main.connect(adminWallet).startRound(rngSignature);
        await startRoundTx.wait();
        console.log("✅ startRound 완료:", startRoundTx.hash);
        await sleep(100);

        // 라운드 상태 확인
        const roundStatus = await main.getRoundStatus(roundId);
        console.log(`📊 라운드 ${roundId} 상태: ${getStatusName(roundStatus)}`);

        // 2. closeTicketRound (PRIVATE_KEY 사용)
        console.log("\n2️⃣ closeTicketRound 실행 중...");
        const closeTicketTx = await main.connect(userWallet).closeTicketRound();
        await closeTicketTx.wait();
        console.log("✅ closeTicketRound 완료:", closeTicketTx.hash);
        await sleep(100);

        // 라운드 상태 확인
        const roundStatusAfterClose = await main.getRoundStatus(roundId);
        console.log(`📊 라운드 ${roundId} 상태: ${getStatusName(roundStatusAfterClose)}`);

        // 3. settleRound (ADMIN_KEY 사용)
        console.log("\n3️⃣ settleRound 실행 중...");
        const settleRoundTx = await main.connect(adminWallet).settleRound(randSeed);
        await settleRoundTx.wait();
        console.log("✅ settleRound 완료:", settleRoundTx.hash);
        await sleep(100);

        // 최종 라운드 상태 확인
        const finalRoundStatus = await main.getRoundStatus(roundId);
        console.log(`📊 라운드 ${roundId} 최종 상태: ${getStatusName(finalRoundStatus)}`);

        // 라운드 정보 출력
        console.log("\n📋 라운드 정보:");
        console.log(`  - 라운드 ID: ${roundId}`);
        console.log(`  - 최종 상태: ${getStatusName(finalRoundStatus)}`);
        console.log(`  - 랜덤 시드: ${randSeed}`);

        console.log("\n🎉 Commit-Reveal 테스트가 성공적으로 완료되었습니다!");

    } catch (error) {
        console.error("❌ 테스트 중 오류가 발생했습니다:", error);
        process.exit(1);
    }
}

function getStatusName(status) {
    const statusNames = ['NotStarted', 'Proceeding', 'Drawing', 'Claiming', 'Refunding', 'Ended'];
    return statusNames[status] || `Unknown(${status})`;
}

// 스크립트 실행
main()
    .then(() => {
        console.log("\n🎯 Commit-Reveal 테스트 완료");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Commit-Reveal 테스트 실패:", error);
        process.exit(1);
    }); 