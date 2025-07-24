const { ethers } = require("hardhat");
const crypto = require('crypto');

// EIP-712 시그니처 생성 함수
async function createSignature(adminWallet, rngAddress, roundId, randSeed) {
    const rngDomain = {
        name: 'Custom-Rng',
        version: '1',
        chainId: await adminWallet.provider.getNetwork().then(n => n.chainId),
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
    return rngSignature;
}

// startRound 실행 함수
async function executeStartRound(main, adminWallet, rngAddress, roundId, randSeed) {
    try {
        // EIP-712 시그니처 생성
        const signature = await createSignature(adminWallet, rngAddress, roundId, randSeed);

        // startRound 호출
        const startRoundTx = await main.connect(adminWallet).startRound(signature);
        await startRoundTx.wait();
        
        return { success: true, transaction: startRoundTx };
    } catch (error) {
        throw error;
    }
}

// 메인 startRound 함수
async function startRound(mainAddress, customProvider = null, customWallet = null) {
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
        const deploymentInfo = require('../../output/deployment-info.json');
        const rngAddress = deploymentInfo.contracts.rng;
        
        const MainArtifact = require('../../../artifacts/contracts/Main.sol/Main.json');
        const main = new ethers.Contract(mainAddress, MainArtifact.abi, provider);

        // 3. 현재 라운드 정보 확인
        const currentRoundId = await main.roundId();
        const roundId = currentRoundId + 1n;
        const buf = crypto.randomBytes(32);
        const hexStr = '0x' + buf.toString('hex');
        const randSeed = hexStr;

        // 4. startRound 실행
        const result = await executeStartRound(main, adminWallet, rngAddress, roundId, randSeed);

        // 5. 라운드 상태 확인
        const roundStatus = await main.getRoundStatus(roundId);

        return {
            success: true,
            roundId: roundId.toString(),
            randSeed: randSeed,
            transaction: result.transaction,
            roundStatus: getStatusName(roundStatus)
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

module.exports = { startRound, executeStartRound }; 