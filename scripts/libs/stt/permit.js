/**
 * @file permit.js
 * @notice STT 토큰 permit 후 transferFrom 관련 Library
 * @author hlibbc
 */
const { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes, ethers } = require("ethers");
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * @notice deployment-info.json에서 STT 토큰 주소를 읽어온다.
 * @returns STT 토큰 주소
 */
function getSttAddressFromDeploymentInfo() {
    try {
        const deploymentInfoPath = path.join(__dirname, '../../output/deployment-info.json');
        const deploymentInfo = JSON.parse(fs.readFileSync(deploymentInfoPath, 'utf8'));
        return deploymentInfo.contracts.sttToken;
    } catch (error) {
        throw new Error(`deployment-info.json에서 STT 주소 읽기 실패: ${error.message}`);
    }
}

/**
 * @notice STT 컨트랙트를 초기화한다.
 * @param {*} sttAddress STT 컨트랙트 주소
 * @param {*} provider Provider 객체
 * @returns STT 컨트랙트 인스턴스
 */
async function initializeContracts(sttAddress, provider) {
    try {
        const abi = require("../../../artifacts/contracts/SttPermit.sol/SttPermit.json").abi;
        const stt = new Contract(sttAddress, abi, provider);
        return stt;
    } catch (error) {
        throw new Error(`컨트랙트 초기화 실패: ${error.message}`);
    }
}

/**
 * @notice STT 토큰 잔액을 확인한다.
 * @param {*} stt STT 컨트랙트 인스턴스
 * @param {*} address 주소
 * @returns STT 토큰 잔액
 */
async function getSttBalance(stt, address) {
    try {
        const balance = await stt.balanceOf(address);
        return balance;
    } catch (error) {
        throw new Error(`STT 잔액 확인 실패: ${error.message}`);
    }
}

/**
 * @notice STT 토큰의 permit 서명을 생성한다.
 * @dev EIP-2612 표준을 따른다.
 * @param {*} stt STT 컨트랙트 인스턴스
 * @param {*} owner 서명할 지갑 (OWNER_KEY)
 * @param {*} spender spender 주소 (PRIVATE_KEY)
 * @param {*} deadline 서명 만료 시간
 * @param {*} amount 허용할 토큰 양
 * @returns permit 서명
 */
async function createPermitSignature(stt, owner, spender, deadline, amount) {
    try {
        const nonce = await stt.nonces(owner.address);
        console.log(`🔢 Current nonce for ${owner.address}: ${nonce}`);
        
        const domain = {
            name: await stt.name(),
            version: '1',
            chainId: await owner.provider.getNetwork().then(net => net.chainId),
            verifyingContract: stt.target
        };
        console.log(`📝 Domain name: ${domain.name}`);
        console.log(`🔗 Chain ID: ${domain.chainId}`);
        console.log(`📄 Verifying contract: ${domain.verifyingContract}`);
        
        const types = {
            Permit: [
                { name: 'owner', type: 'address' },
                { name: 'spender', type: 'address' },
                { name: 'value', type: 'uint256' },
                { name: 'nonce', type: 'uint256' },
                { name: 'deadline', type: 'uint256' }
            ]
        };
        
        const message = {
            owner: owner.address,
            spender: spender.address,
            value: amount,
            nonce: nonce,
            deadline: deadline
        };
        
        console.log(`📋 Permit message:`, {
            owner: message.owner,
            spender: message.spender,
            value: amount.toString(),
            nonce: nonce.toString(),
            deadline: deadline.toString()
        });
        
        const signature = await owner.signTypedData(domain, types, message);
        console.log(`✍️ Signature generated: ${signature}`);
        return signature;
    } catch (error) {
        throw new Error(`Permit 서명 생성 실패: ${error.message}`);
    }
}

/**
 * @notice permit 후 transferFrom을 실행한다.
 * @param {*} stt STT 컨트랙트 인스턴스
 * @param {*} spender spender 지갑
 * @param {*} owner owner 주소
 * @param {*} to 수신자 주소
 * @param {*} amount 전송량
 * @param {*} deadline permit 만료 시간
 * @param {*} permitSig permit 서명
 * @returns 트랜잭션 정보 (transaction, receipt)
 */
async function executePermitAndTransferFrom(stt, spender, owner, to, amount, deadline, permitSig) {
    try {
        // permit 서명을 r, s, v로 분해
        const sig = ethers.Signature.from(permitSig);
        console.log(`🔍 Signature components:`, {
            v: sig.v,
            r: sig.r,
            s: sig.s
        });
        
        console.log(`🚀 Executing permit with:`, {
            owner: owner,
            spender: spender.address,
            amount: amount.toString(),
            deadline: deadline.toString(),
            v: sig.v,
            r: sig.r,
            s: sig.s
        });
        
        // permit 호출
        const permitTx = await stt.connect(spender).permit(
            owner,
            spender.address,
            amount,
            deadline,
            sig.v,
            sig.r,
            sig.s
        );
        console.log(`✅ Permit transaction sent: ${permitTx.hash}`);
        await permitTx.wait();
        console.log(`✅ Permit transaction confirmed`);
        
        // spender의 현재 nonce 확인
        const currentNonce = await spender.provider.getTransactionCount(spender.address, "latest");
        console.log(`🔢 Current nonce for spender ${spender.address}: ${currentNonce}`);
        
        // transferFrom 호출
        console.log(`🚀 Executing transferFrom: ${owner} -> ${to} (${amount.toString()})`);
        const transferFromTx = await stt.connect(spender).transferFrom(owner, to, amount, {
            nonce: currentNonce
        });
        const receipt = await transferFromTx.wait();
        console.log(`✅ TransferFrom transaction confirmed: ${transferFromTx.hash}`);
        
        return { 
            permitTransaction: permitTx, 
            transferFromTransaction: transferFromTx, 
            receipt 
        };
    } catch (error) {
        throw new Error(`Permit 및 TransferFrom 실행 실패: ${error.message}`);
    }
}

/**
 * @notice STT 토큰의 permit 후 transferFrom을 수행한다.
 * @param {*} to 수신자 주소
 * @param {*} amount 전송량
 * @param {*} customProvider 커스텀 Provider (optional)
 * @param {*} customOwnerWallet 커스텀 Owner Wallet (optional)
 * @param {*} customSpenderWallet 커스텀 Spender Wallet (optional)
 * @returns permit 후 transferFrom 결과
 */
async function permitAndTransferFrom(to, amount, customProvider = null, customOwnerWallet = null, customSpenderWallet = null) {
    try {
        let sttAddress = getSttAddressFromDeploymentInfo();
        console.log(`📋 deployment-info.json에서 STT 주소를 읽어왔습니다: ${sttAddress}`);

        // 1. Provider 및 Wallet 설정
        let provider, ownerWallet, spenderWallet;
        
        if (customProvider && customOwnerWallet && customSpenderWallet) {
            // MetaMask 연동 시 사용할 수 있는 커스텀 provider/wallet
            provider = customProvider;
            ownerWallet = customOwnerWallet;
            spenderWallet = customSpenderWallet;
        } else {
            // 현재 .env 기반 설정
            const providerUrl = process.env.PROVIDER_URL || "http://localhost:8545";
            const ownerKey = process.env.OWNER_KEY;
            const privateKey = process.env.PRIVATE_KEY;
            
            if (!ownerKey) {
                throw new Error("❌ .env 파일에 OWNER_KEY가 설정되지 않았습니다.");
            }
            
            if (!privateKey) {
                throw new Error("❌ .env 파일에 PRIVATE_KEY가 설정되지 않았습니다.");
            }
            
            provider = new JsonRpcProvider(providerUrl);
            ownerWallet = new Wallet(ownerKey, provider);
            spenderWallet = new Wallet(privateKey, provider);
        }

        // 2. 컨트랙트 초기화
        const stt = await initializeContracts(sttAddress, provider);
        
        // 3. Owner STT 잔액 확인
        const ownerBalance = await getSttBalance(stt, ownerWallet.address);
        if(ownerBalance < amount) {
            throw new Error(`❌ Owner의 STT 잔액이 부족합니다. 필요: ${ethers.formatEther(amount)} STT, 보유: ${ethers.formatEther(ownerBalance)} STT`);
        }
        
        // 4. Spender allowance 확인
        const allowance = await stt.allowance(ownerWallet.address, spenderWallet.address);
        if(allowance < amount) {
            console.log(`⚠️ 현재 allowance(${ethers.formatEther(allowance)} STT)가 부족합니다. Permit을 통해 allowance를 증가시킵니다.`);
        }
        
        // 5. 수신자 STT 잔액 확인 (전송 전)
        const recipientBalanceBefore = await getSttBalance(stt, to);
        
        // 6. Permit 서명 생성
        const deadline = Math.floor(Date.now() / 1000) + 3600; // 1시간 후 만료
        const permitSig = await createPermitSignature(stt, ownerWallet, spenderWallet, deadline, amount);

        // 7. Permit 및 TransferFrom 실행
        const { permitTransaction: permitTx, transferFromTransaction: transferFromTx, receipt } = await executePermitAndTransferFrom(
            stt, spenderWallet, ownerWallet.address, to, amount, deadline, permitSig
        );
        
        // 8. 수신자 STT 잔액 확인 (전송 후)
        const recipientBalanceAfter = await getSttBalance(stt, to);

        // 9. 결과 포맷팅
        const result = {
            owner: ownerWallet.address,
            spender: spenderWallet.address,
            recipient: to,
            balanceBefore: recipientBalanceBefore,
            amount: amount.toString(),
            balanceAfter: recipientBalanceAfter,
            permitTransactionHash: permitTx.hash,
            transferFromTransactionHash: transferFromTx.hash,
            blockNumber: receipt.blockNumber
        };

        return result;

    } catch (error) {
        throw error;
    }
}

/**
 * @notice permit 후 transferFrom 결과를 출력한다.
 * @param {*} result permit 후 transferFrom 결과물
 */
function logResult(result) {
    console.log("\n📋 Permit & TransferFrom Reports:");
    console.log("  - Owner:", result.owner);
    console.log("  - Spender:", result.spender);
    console.log("  - 수신자:", result.recipient);
    console.log("  - 수신전 balance:", ethers.formatEther(result.balanceBefore), "STT");
    console.log("  - 전송량:", ethers.formatEther(result.amount), "STT");
    console.log("  - 수신후 balance:", ethers.formatEther(result.balanceAfter), "STT");
    console.log("  - Permit 트랜잭션 해시:", result.permitTransactionHash);
    console.log("  - TransferFrom 트랜잭션 해시:", result.transferFromTransactionHash);
    console.log("  - 블록 번호:", result.blockNumber);
    console.log("  - 전송 시간:", result.transferTime);
}

// 모듈로 export
module.exports = { 
    permitAndTransferFrom,
    logResult
};

// 직접 실행 시 (테스트용)
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.error("❌ 사용법: node permit.js <to_address> <amount_in_ether>");
        console.error("예시: node permit.js 0x456... 10");
        console.error("예시: node permit.js 0x456... 10 0x123...");
        process.exit(1);
    }

    const to = args[0];
    const amount = ethers.parseEther(args[1]);

    permitAndTransferFrom(to, amount)
        .then((result) => {
            console.log("\n🎉 Permit & TransferFrom 성공!");
            logResult(result);
        })
        .catch((error) => {
            console.error("❌ Permit & TransferFrom 실패:", error.message);
            process.exit(1);
        });
}
