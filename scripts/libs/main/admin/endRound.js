/**
 * @file endRound.js
 * @notice Main 컨트랙트 endRound 관련 Library (admin 전용)
 * @author hlibbc
 */
const { ethers } = require("hardhat");

/**
 * @notice endRound 트랜잭션을 실행한다.
 * @param {*} main Main 컨트랙트 인스턴스
 * @param {*} adminWallet Admin 지갑
 * @param {*} roundId 종료할 라운드 ID
 * @returns 트랜잭션 정보 (success, transaction)
 */
async function executeEndRound(main, adminWallet, roundId) {
	try {
		const endRoundTx = await main.connect(adminWallet).endRound(roundId, {
			gasLimit: 500000
		});
		const receipt = await endRoundTx.wait();

		// Gas 사용량 출력
		console.log(`⛽ Gas 사용량: ${receipt.gasUsed.toString()} / ${endRoundTx.gasLimit.toString()}`);
		console.log(`💰 Gas 비용: ${ethers.formatEther(receipt.gasUsed * receipt.gasPrice)} ETH`);

		return { success: true, transaction: endRoundTx };
	} catch (error) {
		throw error;
	}
}

/**
 * @notice 라운드를 종료한다.
 * @param {*} mainAddress Main 컨트랙트 주소
 * @param {*} roundId 종료할 라운드 ID
 * @param {*} customProvider 커스텀 Provider (optional)
 * @param {*} customWallet 커스텀 Wallet (optional)
 * @returns 라운드 종료 결과 (success, roundId, previousStatus, newStatus, transaction)
 */
async function endRound(mainAddress, roundId, customProvider = null, customWallet = null) {
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
		const MainArtifact = require('../../../../artifacts/contracts/Main.sol/Main.json');
		const main = new ethers.Contract(mainAddress, MainArtifact.abi, provider);

		// 3. 종료 전 상태 확인
		const previousStatus = await main.getRoundStatus(roundId);

		// 4. endRound 실행
		const result = await executeEndRound(main, adminWallet, roundId);

		// 5. 종료 후 상태 확인
		const newStatus = await main.getRoundStatus(roundId);

		return {
			success: true,
			roundId: roundId.toString(),
			transaction: result.transaction,
			previousStatus: getStatusName(previousStatus),
			newStatus: getStatusName(newStatus)
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

module.exports = { endRound, executeEndRound };

// 직접 실행 시 (테스트용)
if (require.main === module) {
	const args = process.argv.slice(2);

	if (args.length !== 2) {
		console.error("❌ 사용법: node endRound.js <main_contract_address> <round_id>");
		process.exit(1);
	}

	const mainAddress = args[0];
	const roundIdArg = BigInt(args[1]);

	endRound(mainAddress, roundIdArg)
		.then((result) => {
			console.log("\n✅ endRound 완료:");
			console.log("  - 라운드 ID:", result.roundId);
			console.log("  - 이전 상태:", result.previousStatus);
			console.log("  - 새로운 상태:", result.newStatus);
			console.log("  - 트랜잭션 해시:", result.transaction.hash);
		})
		.catch((error) => {
			console.error("❌ endRound 실패:", error.message || error);
			process.exit(1);
		});
}


