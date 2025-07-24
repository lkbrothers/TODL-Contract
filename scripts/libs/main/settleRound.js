const { ethers } = require("hardhat");

// UTC 기준으로 다음 00:00:00까지의 시간을 계산하는 함수
function getTimeUntilNextMidnight() {
    const now = new Date();
    const utcNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
    
    // 다음 UTC 00:00:00 계산
    const nextMidnight = new Date(utcNow);
    nextMidnight.setUTCHours(24, 0, 0, 0);
    
    const timeUntilMidnight = nextMidnight.getTime() - utcNow.getTime();
    return timeUntilMidnight;
}

// settleRound 실행 함수
async function executeSettleRound(main, adminWallet, roundId, randSeed) {
    try {
        // settleRound 호출
        const settleRoundTx = await main.connect(adminWallet).settleRound(randSeed);
        await settleRoundTx.wait();
        
        return { success: true, transaction: settleRoundTx };
    } catch (error) {
        throw error;
    }
}

// 메인 settleRound 함수
async function settleRound(mainAddress, roundId, randSeed, customProvider = null, customWallet = null) {
    try {
        // 1. Provider 및 Wallet 설정
        let provider, adminWallet;
        
        if (customProvider && customWallet) {
            provider = customProvider;
            adminWallet = customWallet;
        } else {
            // .env 기반 설정
            const adminKey = process.env.ADMIN_KEY;
            const providerUrl = process.env.PROVIDER_URL;
            
            if (!adminKey || !providerUrl) {
                throw new Error("❌ .env 파일에 ADMIN_KEY, PROVIDER_URL을 설정해야 합니다.");
            }
            
            provider = new ethers.JsonRpcProvider(providerUrl);
            adminWallet = new ethers.Wallet(adminKey, provider);
        }

        // 2. 컨트랙트 초기화
        const MainArtifact = require('../../../artifacts/contracts/Main.sol/Main.json');
        const main = new ethers.Contract(mainAddress, MainArtifact.abi, provider);

        // 3. 라운드 정보 확인
        const currentRoundId = await main.roundId();
        
        // 4. 라운드 상태 확인
        const roundStatus = await main.getRoundStatus(roundId);

        // 5. settleRound 실행
        const result = await executeSettleRound(main, adminWallet, roundId, randSeed);

        // 6. 라운드 상태 재확인
        const newRoundStatus = await main.getRoundStatus(roundId);

        // 7. 라운드 정산 정보 확인
        const settleInfo = await main.roundSettleManageInfo(roundId);

        // 8. 라운드 당첨 정보 확인
        const winnerInfo = await main.roundWinnerManageInfo(roundId);

        return {
            success: true,
            roundId: roundId.toString(),
            randSeed: randSeed,
            transaction: result.transaction,
            previousStatus: getStatusName(roundStatus),
            newStatus: getStatusName(newRoundStatus),
            settleInfo: settleInfo,
            winnerInfo: winnerInfo
        };

    } catch (error) {
        throw error;
    }
}

// 라운드 상태 이름 변환 함수
function getStatusName(status) {
    const statusNames = ['NotStarted', 'Proceeding', 'Drawing', 'Claiming', 'Refunding', 'Ended'];
    return statusNames[status] || `Unknown(${status})`;
}

module.exports = { settleRound, executeSettleRound }; 