/**
 * @file settleRounForced.js
 * @notice Main 컨트랙트 settleRoundForced 관련 Library
 * @author hlibbc
 */
const { ethers } = require("hardhat");

/**
 * @notice UTC 기준으로 다음 00:00:00까지의 시간을 계산한다.
 * @returns 다음 UTC 00:00:00까지의 시간 (밀리초)
 */
function getTimeUntilNextMidnight() {
    const now = new Date();
    const utcNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
    
    // 다음 UTC 00:00:00 계산
    const nextMidnight = new Date(utcNow);
    nextMidnight.setUTCHours(24, 0, 0, 0);
    
    const timeUntilMidnight = nextMidnight.getTime() - utcNow.getTime();
    return timeUntilMidnight;
}

/**
 * @notice settleRoundForced 트랜잭션을 실행한다.
 * @param {*} main Main 컨트랙트 주소
 * @param {*} adminWallet Admin 지갑
 * @param {*} roundId 라운드 ID
 * @param {*} winnerHash 당첨 해시
 * @returns 트랜잭션 정보 (success, transaction)
 */
async function executeSettleRoundForced(main, adminWallet, roundId, winnerHash) {
    try {
        // settleRoundForced 호출
        const settleRoundForcedTx = await main.connect(adminWallet).settleRoundForced(roundId, winnerHash, {
            gasLimit: 700000
        });
        const receipt = await settleRoundForcedTx.wait();
        
        // Gas 사용량 출력
        console.log(`⛽ Gas 사용량: ${receipt.gasUsed.toString()} / ${settleRoundForcedTx.gasLimit.toString()}`);
        console.log(`💰 Gas 비용: ${ethers.formatEther(receipt.gasUsed * receipt.gasPrice)} ETH`);
        
        return { success: true, transaction: settleRoundForcedTx };
    } catch (error) {
        throw error;
    }
}

/**
 * @notice 라운드를 강제 정산한다.
 * @param {*} mainAddress Main 컨트랙트 주소
 * @param {*} winnerHash 당첨 해시
 * @param {*} customProvider 커스텀 Provider (optional)
 * @param {*} customWallet 커스텀 Wallet (optional)
 * @returns 라운드 강제 정산 결과 (success, roundId, winnerHash, transaction, previousStatus, newStatus, settleInfo, winnerInfo)
 */
async function settleRoundForced(mainAddress, winnerHash, customProvider = null, customWallet = null) {
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
        const MainArtifact = require('../../../../artifacts/contracts/mocks/MainMock.sol/MainMock.json');
        const main = new ethers.Contract(mainAddress, MainArtifact.abi, provider);

        // 3. 라운드번호 확인
        const currentRoundId = await main.roundId();
        
        // 4. 라운드 상태 확인
        const roundStatus = await main.getRoundStatus(currentRoundId);
        if(roundStatus != 2n) { // Drawing
            throw new Error("❌ 현재 라운드상태가 \"Drawing\"이 아닙니다.");
        }

        // 5. settleRoundForced 실행
        const result = await executeSettleRoundForced(main, adminWallet, currentRoundId, winnerHash);

        // 6. 라운드 상태 재확인
        const newRoundStatus = await main.getRoundStatus(currentRoundId);

        // 7. 라운드 정산 정보 확인
        const settleInfo = await main.roundSettleManageInfo(currentRoundId);

        // 8. 라운드 당첨 정보 확인
        const winnerInfo = await main.roundWinnerManageInfo(currentRoundId);

        return {
            success: true,
            roundId: currentRoundId.toString(),
            winnerHash: winnerHash,
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

/**
 * @notice 라운드 상태 번호를 상태 이름으로 변환한다.
 * @param {*} status 라운드 상태 번호
 * @returns 라운드 상태 이름 (NotStarted, Proceeding, Drawing, Claiming, Refunding, Ended)
 */
function getStatusName(status) {
    const statusNames = ['NotStarted', 'Proceeding', 'Drawing', 'Claiming', 'Refunding', 'Ended'];
    return statusNames[status] || `Unknown(${status})`;
}

module.exports = { settleRoundForced, executeSettleRoundForced }; 