/**
 * @file Main.test.js
 * @notice Main 컨트랙트의 Function 테스트 수행
 * @author hlibbc
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

/**
 * @notice Rng 시그니처 생성과 함께 라운드를 시작한다.
 * @dev 테스트 편의를 위해 randomSeed값은 5로 고정
 * @param {*} main Main 컨트랙트 오브젝트
 * @param {*} rng Rng 컨트랙트 오브젝트
 * @param {*} admin admin 주소, 라운드제어 권한이 있다.
 * @param {*} roundId 라운드 ID
 * @param {*} randSeed admin이 생성할 랜덤시드, 편의상 5로 고정
 */
async function startRoundWithSignature(main, rng, admin, roundId = 1, randSeed = 5) {
    const rngDomain = {
        name: 'Custom-Rng',
        version: '1',
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await rng.getAddress()
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
    
    const rngSignature = await admin.signTypedData(rngDomain, rngTypes, rngMessage);
    const tx = await main.connect(admin).startRound(rngSignature);
    await tx.wait(); // 블록 확정 대기
}

/**
 * @notice ItemParts 각부위가 다 나올떄까지 ItemParts 민팅을 수행한다.
 * @dev ItemParts 각부위가 다 나와야 Agent 민팅이 가능하다.
 * @param {*} itemParts ItemParts NFT 컨트랙트 오브젝트
 * @param {*} user 게임참여자 주소
 * @returns Agent NFT 발행용 ItemParts collection 1벌 (배열)
 */
async function collectRequiredParts(itemParts, user) {
    // 사용자에게 각 부위별 ItemParts 지급 (Head, Body, Legs, Rhand, Lhand)
    const requiredParts = new Set(); // 필요한 부위들의 토큰 ID를 추적
    const maxAttempts = 50; // 최대 시도 횟수 (무한 루프 방지)
    let attempts = 0;
    const mintedTokenIds = []; // 실제 민팅된 토큰 ID들을 추적
    const tokenIdToPartsIndex = new Map(); // 토큰 ID -> partsIndex 매핑
    const partsIndexToTokenId = new Map(); // partsIndex -> 토큰 ID 매핑 (각 부위별 첫 번째 토큰)
    
    while (requiredParts.size < 5 && attempts < maxAttempts) {
        const balanceBefore = await itemParts.totalSupply()+1n; // 민팅 전 잔액
        
        const tx = await itemParts.connect(user).mint();
        await tx.wait(); // 블록 확정 대기
        attempts++;
        
        const balanceAfter = await itemParts.totalSupply(); // 민팅 후 잔액
        
        // 새로 민팅된 토큰들만 처리 (balanceBefore부터 balanceAfter까지)
        for (let i = balanceBefore; i <= balanceAfter; i++) {
            const tokenId = i; // 실제 토큰 ID
            const tokenInfo = await itemParts.tokenInfo(tokenId);
            const idx = Number(tokenInfo.partsIndex); // number로 변환
            tokenIdToPartsIndex.set(tokenId, idx);
            
            // 각 partsIndex별로 첫 번째 토큰 ID만 저장
            if (!partsIndexToTokenId.has(idx)) {
                partsIndexToTokenId.set(idx, tokenId);
                requiredParts.add(tokenId);
            }
        }
    }
    
    // 각 부위별로 하나씩 있는지 확인
    expect(requiredParts.size).to.equal(5);
    
    // partsIndex 순서대로 정렬된 토큰 ID들 선택 (0:Head, 1:Body, 2:Legs, 3:Rhand, 4:Lhand)
    const sortedTokenIds = [];
    const partsOrder = [0, 1, 2, 3, 4]; // partsIndex 순서
    
    for (const partsIndex of partsOrder) {
        const tokenId = partsIndexToTokenId.get(partsIndex); // number key로 조회
        if (tokenId !== undefined) {
            sortedTokenIds.push(tokenId);
        }
    }
    return sortedTokenIds;
}

/**
 * @notice 수집된 부위별 ItemParts NFT로 Agent를 민팅한다.
 * @dev Agent 민팅을 위해 필요한 ItemParts와 수수료 토큰(Token/USDT 등)을 소각하고 Agent NFT를 발행한다.
 * @param {*} main Main 컨트랙트 오브젝트
 * @param {*} token 수수료 토큰(ERC20Permit) 컨트랙트 오브젝트
 * @param {*} rewardPool RewardPool 컨트랙트 오브젝트
 * @param {*} user Agent를 민팅할 사용자 지갑 (ethers.Wallet)
 * @param {*} itemPartsIds Agent 민팅에 사용할 ItemParts 토큰 ID 배열
 * @returns Agent 민팅 트랜잭션 결과
 */
async function mintAgent(main, token, rewardPool, user, itemPartsIds) {
    const currentBlockTime = await ethers.provider.getBlock("latest").then(block => block.timestamp);
    const deadline = BigInt(currentBlockTime + 172800); // uint256

    // 🔹 토큰 decimals 반영: 1 토큰 = parseUnits("1", decimals)
    const decimals = await token.decimals();
    const oneToken = ethers.parseUnits("1", decimals);

    // Permit 서명 생성
    const domain = {
        name: await token.name(),
        version: "1",
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await token.getAddress()
    };

    const types = {
        Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" }
        ]
    };

    const message = {
        owner: user.address,
        spender: await rewardPool.getAddress(),
        value: oneToken, // ✅ decimals 반영
        nonce: await token.nonces(user.address),
        deadline: deadline
    };

    const signature = await user.signTypedData(domain, types, message);

    // Agent 민팅 실행 (deadline은 uint256이므로 BigInt 전달 OK)
    return await main.connect(user).buyAgent(itemPartsIds, deadline, signature);
}


describe("Main Contract", function () {
    let main, itemParts, agent, rng, rewardPool, stakePool, reserv, token;
    let owner, admin, carrier, donateAddr, corporateAddr, operationAddr, user1, user2, user3;
    let managedContracts;

    beforeEach(async function () {
        [owner, admin, carrier, donateAddr, corporateAddr, operationAddr, user1, user2, user3] = await ethers.getSigners();

        // 컨트랙트 배포
        let tokenName = (process.env.USE_STABLE_COIN == '1')? ("StableCoin") : ("SttPermit");
        const Token = await ethers.getContractFactory(tokenName);
        const Main = await ethers.getContractFactory("MainMock"); // 테스트용
        const ItemParts = await ethers.getContractFactory("ItemPartsNFT");
        const Agent = await ethers.getContractFactory("AgentNFT");
        const Rng = await ethers.getContractFactory("Rng");
        const RewardPool = await ethers.getContractFactory("RewardPool");
        const StakePool = await ethers.getContractFactory("StakePool");
        const Reserv = await ethers.getContractFactory("Reserv");

            // Token 토큰 먼저 배포
        token = await Token.deploy();
        await token.waitForDeployment();
        let tokenAddr = await token.getAddress();

        // Main 컨트랙트 배포 (생성자에 필요한 파라미터 전달)
        main = await Main.deploy([admin.address, carrier.address], donateAddr.address, corporateAddr.address, operationAddr.address);
        await main.waitForDeployment();
        let mainAddr = await main.getAddress();

        // 다른 컨트랙트들 배포
        itemParts = await ItemParts.deploy(mainAddr);
        await itemParts.waitForDeployment();
        agent = await Agent.deploy(mainAddr);
        await agent.waitForDeployment();
        rng = await Rng.deploy(mainAddr, admin.address);
        await rng.waitForDeployment();
        rewardPool = await RewardPool.deploy(mainAddr, tokenAddr);
        await rewardPool.waitForDeployment();
        stakePool = await StakePool.deploy(tokenAddr);
        await stakePool.waitForDeployment();
        reserv = await Reserv.deploy(tokenAddr);
        await reserv.waitForDeployment();

        // managedContracts 설정
        managedContracts = await Promise.all([
            itemParts.getAddress(),
            agent.getAddress(),
            rng.getAddress(),
            rewardPool.getAddress(),
            stakePool.getAddress(),
            reserv.getAddress(),
            token.getAddress()
        ]);
        await main.setContracts(managedContracts);

        // 사용자들에게 Token 토큰 지급
        const DECIMALS = await token.decimals();
        await token.transfer(user1.address, ethers.parseUnits("1000", DECIMALS));
        await token.transfer(user2.address, ethers.parseUnits("1000", DECIMALS));
        await token.transfer(user3.address, ethers.parseUnits("1000", DECIMALS));
    });

    describe("초기화", function () {
        it("컨트랙트가 올바르게 초기화되어야 한다", async function () {
            expect(await main.roundId()).to.equal(0);
                expect(await main.admins(owner.address)).to.equal(true);
                expect(await main.admins(admin.address)).to.equal(true);
                expect(await main.admins(carrier.address)).to.equal(true);
            expect(await main.donateAddr()).to.equal(donateAddr.address);
            expect(await main.corporateAddr()).to.equal(corporateAddr.address);
            expect(await main.operationAddr()).to.equal(operationAddr.address);
        });

        it("managedContracts가 올바르게 설정되어야 한다", async function () {
                expect(await main.managedContracts(0)).to.equal(await main.getAddress());
                expect(await main.managedContracts(1)).to.equal(await itemParts.getAddress());
                expect(await main.managedContracts(2)).to.equal(await agent.getAddress());
                expect(await main.managedContracts(3)).to.equal(await rng.getAddress());
                expect(await main.managedContracts(4)).to.equal(await rewardPool.getAddress());
                expect(await main.managedContracts(5)).to.equal(await stakePool.getAddress());
                expect(await main.managedContracts(6)).to.equal(await reserv.getAddress());
                expect(await main.managedContracts(7)).to.equal(await token.getAddress());
            });
        });

    describe("Admin 관리", function () {
        it("admin 주소를 설정할 수 있어야 한다", async function () {
            const newAdmin = user1.address;
            await main.setAdminAddress(newAdmin, true);
            expect(await main.admins(newAdmin)).to.equal(true);
            await main.setAdminAddress(newAdmin, false);
            expect(await main.admins(newAdmin)).to.equal(false);
        });

        it("zero address로 설정할 수 없어야 한다", async function () {
            await expect(main.setAdminAddress(ethers.ZeroAddress, true))
                .to.be.revertedWith("admin: zero address");
        });

        it("같은 세팅으로 설정할 수 없어야 한다", async function () {
            await expect(main.setAdminAddress(admin.address, true))
                .to.be.revertedWith("admin: same setting");
            await expect(main.setAdminAddress(user1.address, false))
                .to.be.revertedWith("admin: same setting");
        });

        it("owner가 아닌 계정은 주소를 설정할 수 없어야 한다", async function () {
            await expect(main.connect(user1).setAdminAddress(user2.address, true))
                .to.be.revertedWithCustomError(main, "OwnableUnauthorizedAccount");
        });
    });

    describe("주소 설정", function () {
        it("기부금 주소를 설정할 수 있어야 한다", async function () {
            const newDonateAddr = user1.address;
            await main.setDonateAddress(newDonateAddr);
            expect(await main.donateAddr()).to.equal(newDonateAddr);
        });

        it("영리법인 주소를 설정할 수 있어야 한다", async function () {
            const newCorporateAddr = user2.address;
            await main.setCorporateAddress(newCorporateAddr);
            expect(await main.corporateAddr()).to.equal(newCorporateAddr);
        });

        it("운영비 주소를 설정할 수 있어야 한다", async function () {
            const newOperationAddr = user3.address;
            await main.setOperationAddress(newOperationAddr);
            expect(await main.operationAddr()).to.equal(newOperationAddr);
        });

        it("zero address로 설정할 수 없어야 한다", async function () {
            await expect(main.setDonateAddress(ethers.ZeroAddress))
                .to.be.revertedWith("donate: zero address");
            await expect(main.setCorporateAddress(ethers.ZeroAddress))
                .to.be.revertedWith("corporate: zero address");
            await expect(main.setOperationAddress(ethers.ZeroAddress))
                .to.be.revertedWith("operation: zero address");
        });

        it("같은 주소로 설정할 수 없어야 한다", async function () {
            await expect(main.setDonateAddress(donateAddr.address))
                .to.be.revertedWith("donate: same address");
            await expect(main.setCorporateAddress(corporateAddr.address))
                .to.be.revertedWith("corporate: same address");
            await expect(main.setOperationAddress(operationAddr.address))
                .to.be.revertedWith("operation: same address");
        });

        it("owner가 아닌 계정은 주소를 설정할 수 없어야 한다", async function () {
            await expect(main.connect(user1).setDonateAddress(user2.address))
                .to.be.revertedWithCustomError(main, "OwnableUnauthorizedAccount");
            await expect(main.connect(user1).setCorporateAddress(user2.address))
                .to.be.revertedWithCustomError(main, "OwnableUnauthorizedAccount");
            await expect(main.connect(user1).setOperationAddress(user2.address))
                .to.be.revertedWithCustomError(main, "OwnableUnauthorizedAccount");
        });
    });

    describe("라운드 관리", function () {
        beforeEach(async function () {
            // 라운드 시작을 위한 기본 설정
            await startRoundWithSignature(main, rng, admin);
        });

        it("라운드를 시작할 수 있어야 한다", async function () {
            expect(await main.roundId()).to.equal(1);
            expect(await main.getRoundStatus(1)).to.equal(1); // Proceeding
        });

        it("admin이 아닌 계정은 라운드를 시작할 수 없어야 한다", async function () {
            await expect(main.connect(user1).startRound("0x"))
                .to.be.revertedWithCustomError(main, "NotAdmin");
        });

        it("이전 라운드가 완료되지 않으면 새 라운드를 시작할 수 없어야 한다", async function () {
            await expect(main.connect(admin).startRound("0x"))
                .to.be.revertedWithCustomError(main, "LastRoundNotEnded");
        });

        it("라운드 상태를 조회할 수 있어야 한다", async function () {
            expect(await main.getRoundStatus(1)).to.equal(1); // Proceeding
        });
    });

    describe("Token 잔액 조회", function () {
        it("사용자의 Token 잔액을 조회할 수 있어야 한다", async function () {
            const balance = await main.getCoinBalance(user1.address);
            const DECIMALS = await token.decimals();
            expect(balance).to.equal(ethers.parseUnits("1000", DECIMALS));
        });
    });

    describe("Agent 구매", function () {
        it("Agent를 구매할 수 있어야 한다", async function () {
            // user1에게 각 부위별 ItemParts 지급 (Head, Body, Legs, Rhand, Lhand)
            const user1Tokens = await collectRequiredParts(itemParts, user1);
            await startRoundWithSignature(main, rng, admin); // 라운드를 진행중 상태로 변경
            const user1ItemPartsIds = user1Tokens.slice(0, 5); // 처음 5개 토큰 사용
            await mintAgent(main, token, rewardPool, user1, user1ItemPartsIds);
      
            // Agent가 민팅되었는지 확인
            expect(await agent.balanceOf(user1.address)).to.equal(1);
        });

        it("라운드가 진행중이 아니면 Agent를 구매할 수 없어야 한다", async function () {
            // user1에게 각 부위별 ItemParts 지급 (Head, Body, Legs, Rhand, Lhand)
            const user1Tokens = await collectRequiredParts(itemParts, user1);
            await startRoundWithSignature(main, rng, admin); // 라운드를 진행중 상태로 변경
            const user1ItemPartsIds = user1Tokens.slice(0, 5); // 처음 5개 토큰 사용
            await mintAgent(main, token, rewardPool, user1, user1ItemPartsIds);

            // 23시간 증가 (82800초 = 23시간)
            await ethers.provider.send("evm_increaseTime", [82800]);
            await ethers.provider.send("evm_mine");

            // 라운드를 세일종료 상태로 변경
            await main.connect(user1).closeTicketRound();

            // user2가 Agent 발행을 위해 Parts 수집
            const user2Tokens = await collectRequiredParts(itemParts, user2);
            const user2ItemPartsIds = user2Tokens.slice(0, 5); // 처음 5개 토큰 사용
            
            await expect(mintAgent(main, token, rewardPool, user2, user2ItemPartsIds))
                .to.be.revertedWith("Round is not proceeding");
        });

        it("Token 잔액이 부족하면 Agent를 구매할 수 없어야 한다", async function () {
            // 사용자의 Token 잔액을 0으로 만듦
            await token.connect(user1).transfer(user2, await token.balanceOf(user1.address));
            
            const user1Tokens = await collectRequiredParts(itemParts, user1);
            await startRoundWithSignature(main, rng, admin); // 라운드를 진행중 상태로 변경
            const user1ItemPartsIds = user1Tokens.slice(0, 5); // 처음 5개 토큰 사용
            await expect(mintAgent(main, token, rewardPool, user1, user1ItemPartsIds))
                .to.be.revertedWithCustomError(main, "InsufficientCoin");
        });

        it("올바르지 않은 ItemParts로 Agent를 구매할 수 없어야 한다", async function () {
            const user1Tokens = await collectRequiredParts(itemParts, user1);
            await startRoundWithSignature(main, rng, admin); // 라운드를 진행중 상태로 변경
            
            const invalidItemPartsIds = [...user1Tokens.slice(0, 4), user1Tokens[0]]; // user2의 첫 번째 부위 토큰 포함
            await expect(mintAgent(main, token, rewardPool, user1, invalidItemPartsIds))
                .to.be.revertedWithCustomError(main, "InvalidParts");
        });

        it("소유하지 않은 ItemParts로 Agent를 구매할 수 없어야 한다", async function () {
            const user1Tokens = await collectRequiredParts(itemParts, user1);
            await startRoundWithSignature(main, rng, admin); // 라운드를 진행중 상태로 변경
            
            // user2가 소유한 ItemParts를 user1이 사용하려고 시도
            const user2Tokens = await collectRequiredParts(itemParts, user2);

            const invalidItemPartsIds = [...user1Tokens.slice(0, 4), user2Tokens[0]]; // user2의 첫 번째 부위 토큰 포함
            await expect(mintAgent(main, token, rewardPool, user1, invalidItemPartsIds))
                .to.be.revertedWithCustomError(main, "NotItemPartsOwner");
        });
    });

    describe("라운드 세일 종료", function () {
        it("Agent 소유자가 라운드 세일을 종료할 수 있어야 한다", async function () {
            await startRoundWithSignature(main, rng, admin);

            // collectRequiredParts 함수를 사용하여 필요한 ItemParts 수집
            const itemPartsIds = await collectRequiredParts(itemParts, user1);
            
            await mintAgent(main, token, rewardPool, user1, itemPartsIds);
            // 시간을 조작하여 세일 종료 가능 시간으로 설정
            await ethers.provider.send("evm_increaseTime", [82800]); // 24시간 증가
            await ethers.provider.send("evm_mine");
            
            await main.connect(user1).closeTicketRound();
            expect(await main.getRoundStatus(1)).to.equal(2); // Drawing
        });

        it("admin은 라운드 세일을 종료할 수 없어야 한다", async function () {
            await startRoundWithSignature(main, rng, admin);
            
            await ethers.provider.send("evm_increaseTime", [82800]);
            await ethers.provider.send("evm_mine");
            
            await expect(main.connect(admin).closeTicketRound())
                .to.be.revertedWith("Not permitted");
        });
    });

    describe("라운드 정산", function () {
        beforeEach(async function () {
            await startRoundWithSignature(main, rng, admin);
            
            // collectRequiredParts 함수를 사용하여 필요한 ItemParts 수집
            const itemPartsIds = await collectRequiredParts(itemParts, user1);
            
            await mintAgent(main, token, rewardPool, user1, itemPartsIds);
            
            await ethers.provider.send("evm_increaseTime", [82800]);
            await ethers.provider.send("evm_mine");
        });

        it("admin이 라운드를 정산할 수 있어야 한다", async function () {
            await main.connect(user1).closeTicketRound();
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine");
            
            await main.connect(admin).settleRound(5);
            expect(await main.getRoundStatus(1)).to.equal(3); // Claiming
        });

        /// 정산 발생유무 체크

        it("admin이 아닌 계정은 라운드를 정산할 수 없어야 한다", async function () {
            await main.connect(user1).closeTicketRound();
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine");
            
            await expect(main.connect(user1).settleRound(5))
                .to.be.revertedWithCustomError(main, "NotAdmin");
        });

        it("라운드가 Drawing 상태가 아니면 정산할 수 없어야 한다", async function () {
            await expect(main.connect(admin).settleRound(5))
                .to.be.revertedWith("Round is not drawing");
        });
    });

    describe("당첨금 수령", function () {
        let user1AgentType, user1AgentId, user2AgentType, user2AgentId, winningHash;
        
        beforeEach(async function () {
            await startRoundWithSignature(main, rng, admin);
            
            // collectRequiredParts 함수를 사용하여 필요한 ItemParts 수집
            const user1ItemPartsIds = await collectRequiredParts(itemParts, user1);
            await mintAgent(main, token, rewardPool, user1, user1ItemPartsIds);
            
            // user1의 Agent typeOf 값 가져오기
            user1AgentId = 1;
            user1AgentType = await agent.typeOf(user1AgentId);
            
            // user2가 user1과 다른 typeOf 값을 가진 Agent를 민팅할 때까지 반복
            user2AgentId = 1;
            do {
                ++user2AgentId;
                const user2ItemPartsIds = await collectRequiredParts(itemParts, user2);
                await mintAgent(main, token, rewardPool, user2, user2ItemPartsIds);
                user2AgentType = await agent.typeOf(user2AgentId);
            } while (user2AgentType === user1AgentType);

            winningHash = await agent.typeOf(1);
            
            await ethers.provider.send("evm_increaseTime", [82800]);
            await ethers.provider.send("evm_mine");
            await main.connect(user1).closeTicketRound();
            
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine");
            await main.connect(admin).settleRoundForced(1, winningHash);
        });

        it("당첨 Agent 소유자가 당첨금을 수령할 수 있어야 한다", async function () {
            const beforeBalance = await token.balanceOf(user1.address);
            
            await main.connect(user1).claim(1, user1AgentId);

            const afterBalance = await token.balanceOf(user1.address);
            
            // Agent가 소각되었는지 확인
            expect(await agent.balanceOf(user1.address)).to.equal(0);
            // 당첨금이 들어왔는지 확인
            expect(afterBalance).to.be.gt(beforeBalance);
        });

        it("Agent 소유자가 아닌 사용자는 당첨금을 수령할 수 없어야 한다", async function () {
            
            await expect(main.connect(user2).claim(1, user1AgentId))
                .to.be.revertedWith("claim: Not owner");
        });

        it("당첨 Agent가 아니면 당첨금을 수령할 수 없어야 한다", async function () {
            // 다른 Agent를 생성
            await expect(main.connect(user2).claim(1, user2AgentId))
                .to.be.revertedWith("claim: Not winner");
        });

        it("라운드가 Claiming 상태가 아니면 당첨금을 수령할 수 없어야 한다", async function () {
            await ethers.provider.send("evm_increaseTime", [2592000]); // 30일 증가
            await ethers.provider.send("evm_mine");
            // 라운드를 종료 상태로 변경
            await main.connect(admin).endRound(1);
            
            await expect(main.connect(user1).claim(1, user1AgentId))
                .to.be.revertedWith("Round is not claiming");
        });

        it("30일(payoutLimitTime) 이후 당첨금 수령 시, 정상 수령되고 라운드가 Ended로 전이되어야 한다", async function () {
            // ⬆️ Claiming 상태에서 30일 경과
            await ethers.provider.send("evm_increaseTime", [2592000]); // 30일 = 2,592,000초
            await ethers.provider.send("evm_mine");

            // 수령 전 잔액
            const beforeBalance = await token.balanceOf(user1.address);

            // ✅ 당첨자(user1)가 자신의 Agent로 수령 (beforeEach에서 user1AgentId 설정됨)
            await main.connect(user1).claim(1, user1AgentId);

            // Agent가 소각되었는지 확인
            expect(await agent.balanceOf(user1.address)).to.equal(0);

            // 당첨금이 입금되었는지 확인 (정확 금액 산정 로직이 별도이므로 증가 여부만 체크)
            const afterBalance = await token.balanceOf(user1.address);
            expect(afterBalance).to.be.gt(beforeBalance);

            // 라운드 상태가 Ended(5)로 전이되었는지 확인
            expect(await main.getRoundStatus(1)).to.equal(5);
        });

    });

    describe("환불", function () {
        beforeEach(async function () {
            await startRoundWithSignature(main, rng, admin);
            
            // collectRequiredParts 함수를 사용하여 필요한 ItemParts 수집
            const itemPartsIds = await collectRequiredParts(itemParts, user1);
            
            await mintAgent(main, token, rewardPool, user1, itemPartsIds);
        });

        it("환불 시간이 지나면 Agent를 환불할 수 있어야 한다", async function () {
            // 환불 가능 시간으로 설정 (ROUND_REFUND_AVAIL_TIME 이후)
            await ethers.provider.send("evm_increaseTime", [172800]); // 48시간 증가
            await ethers.provider.send("evm_mine");
            
            const agentId = 1;
            const beforeBalance = await token.balanceOf(user1.address);
            
            await main.connect(user1).refund(1, agentId);

            const afterBalance = await token.balanceOf(user1.address);
            
            // Agent가 소각되었는지 확인
            expect(await agent.balanceOf(user1.address)).to.equal(0);
            // 환불액이 정확히 1 ether인지 확인
            const DECIMALS = await token.decimals();
            expect(afterBalance - beforeBalance).to.equal(ethers.parseUnits("1", DECIMALS));
        });

        it("환불 시간이 지나지 않으면 환불할 수 없어야 한다", async function () {
            const agentId = 1;
            
            await expect(main.connect(user1).refund(1, agentId))
                .to.be.revertedWith("Round is not Refunding");
        });

        it("Agent 소유자가 아닌 사용자는 환불할 수 없어야 한다", async function () {
            await ethers.provider.send("evm_increaseTime", [172800]);
            await ethers.provider.send("evm_mine");
            
            const agentId = 0;
            
            await expect(main.connect(user2).refund(1, agentId))
                .to.be.revertedWith("Mismatch (Agent & round)");
        });

        it("payoutLimitTime(≈30일) 경과 후 refund 시, STT가 환불되고 라운드가 Ended로 전이되어야 한다", async function () {
            // 4) 30 days 이동 (payoutLimitTime 이후)
            await ethers.provider.send("evm_increaseTime", [2592000]); // 30일 = 2,592,000초
            await ethers.provider.send("evm_mine");

            // 5) 해당 agent에 대해 refund 수행
            const agentId = 1; // 앞선 beforeEach에서 user1이 첫 번째 Agent를 민팅했다고 가정
            const beforeBalance = await token.balanceOf(user1.address);

            await main.connect(user1).refund(1, agentId);

            // 6) 지갑으로 STT 환불되었는지 확인 (데시멀 반영)
            const afterBalance = await token.balanceOf(user1.address);
            const DECIMALS = await token.decimals();
            const oneToken = ethers.parseUnits("1", DECIMALS);

            // Agent 소각 확인
            expect(await agent.balanceOf(user1.address)).to.equal(0);

            // 정확히 1 토큰 환불 확인
            expect(afterBalance - beforeBalance).to.equal(oneToken);

            // 7) 라운드 상태가 Ended(5)로 전이되었는지 확인
            expect(await main.getRoundStatus(1)).to.equal(5);
        });
    });

    describe("라운드 종료", function () {
        it("admin이 라운드를 종료할 수 있어야 한다", async function () {
            await startRoundWithSignature(main, rng, admin);
            // 라운드 종료 가능 시간으로 설정
            await ethers.provider.send("evm_increaseTime", [2592000]); // 30일 증가
            await ethers.provider.send("evm_mine");
            
            await main.connect(admin).endRound(1);
            expect(await main.getRoundStatus(1)).to.equal(5); // Ended
        });

        it("admin이 아닌 계정은 라운드를 종료할 수 없어야 한다", async function () {
            await startRoundWithSignature(main, rng, admin);
            await ethers.provider.send("evm_increaseTime", [2592000]);
            await ethers.provider.send("evm_mine");
            
            await expect(main.connect(user1).endRound(1))
                .to.be.revertedWithCustomError(main, "NotAdmin");
        });

        it("라운드가 NotStarted 상태면 종료할 수 없어야 한다", async function () {
            await expect(main.connect(admin).endRound(0))
                .to.be.revertedWithCustomError(main, "EndRoundNotAllowed");
        });

        it("라운드가 이미 Ended 상태면 종료할 수 없어야 한다", async function () {
            await startRoundWithSignature(main, rng, admin);
            await ethers.provider.send("evm_increaseTime", [2592000]);
            await ethers.provider.send("evm_mine");
            await main.connect(admin).endRound(1);
            
            await expect(main.connect(admin).endRound(1))
                .to.be.revertedWithCustomError(main, "EndRoundNotAllowed");
        });
    });

    describe("라운드 정산 - 당첨자 없음", function () {
        let round1DepositedAmount, round2InitialDepositedAmount;
        
        beforeEach(async function () {
            await startRoundWithSignature(main, rng, admin);
            
            // user1이 Agent를 민팅하여 라운드 1에 1 ether 입금
            const user1ItemPartsIds = await collectRequiredParts(itemParts, user1);
            await mintAgent(main, token, rewardPool, user1, user1ItemPartsIds);
            
            // 라운드 1의 총 입금액 확인
            const DECIMALS = await token.decimals();
            round1DepositedAmount = ethers.parseUnits("1", DECIMALS);
            // 23간 증가하여 세일 종료 가능 시간으로 설정
            await ethers.provider.send("evm_increaseTime", [82800]);
            await ethers.provider.send("evm_mine");
            
            // 라운드 1 세일 종료
            await main.connect(user1).closeTicketRound();
            
            //1시간 증가하여 정산 가능 시간으로 설정
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine");
        });

        it("당첨자가 없을 때 100%는 다음 라운드로 이월되고 즉시 분배는 없어야 한다", async function () {
            // 각 주소의 초기 잔액 저장
            const donateInitialBalance = BigInt((await token.balanceOf(donateAddr)).toString());
            const corporateInitialBalance = BigInt((await token.balanceOf(corporateAddr)).toString());
            const operationInitialBalance = BigInt((await token.balanceOf(operationAddr)).toString());
            const stakePoolInitialBalance = BigInt((await token.balanceOf(stakePool.getAddress())).toString());

            // 라운드 2 시작 전 초기 상태 확인
            const round2BeforeSettle = await main.roundSettleManageInfo(2);
            round2InitialDepositedAmount = round2BeforeSettle.depositedAmount;

            // 당첨자가 없는 상태로 정산 (winnerCount = 0)
            await main.connect(admin).settleRoundForced(1, ethers.keccak256("0x")); // 존재하지 않는 해시로 설정하여 당첨자 없음

            // 라운드 1 정산 정보 확인
            const round1SettleInfo = await main.roundSettleManageInfo(1);

            // 즉시 분배 0 확인
            expect(round1SettleInfo.donateAmount).to.equal(0n);
            expect(round1SettleInfo.corporateAmount).to.equal(0n);
            expect(round1SettleInfo.operationAmount).to.equal(0n);
            expect(round1SettleInfo.stakedAmount).to.equal(0n);

            // 당첨금 관련 값도 0
            expect(round1SettleInfo.totalPrizePayout).to.equal(0n);
            expect(round1SettleInfo.prizePerWinner).to.equal(0n);

            // 실제 잔액 변화 없음 확인
            const donateAfterBalance = BigInt((await token.balanceOf(donateAddr)).toString());
            const corporateAfterBalance = BigInt((await token.balanceOf(corporateAddr)).toString());
            const operationAfterBalance = BigInt((await token.balanceOf(operationAddr)).toString());
            const stakePoolAfterBalance = BigInt((await token.balanceOf(stakePool.getAddress())).toString());

            expect(donateAfterBalance - donateInitialBalance).to.equal(0n);
            expect(corporateAfterBalance - corporateInitialBalance).to.equal(0n);
            expect(operationAfterBalance - operationInitialBalance).to.equal(0n);
            expect(stakePoolAfterBalance - stakePoolInitialBalance).to.equal(0n);

            // 라운드 2에 100% 이월 확인
            const round2AfterSettle = await main.roundSettleManageInfo(2);
            const expectedCarriedAmount = round1DepositedAmount; // 100% carry
            expect(round2AfterSettle.depositedAmount - round2InitialDepositedAmount).to.equal(expectedCarriedAmount);

            // (옵션) 라운드1의 carriedOutAmount도 검증
            expect(round1SettleInfo.carriedOutAmount).to.equal(expectedCarriedAmount);
        });

        it("당첨자가 없을 때 라운드 상태가 Claiming으로 변경되어야 한다", async function () {
            await main.connect(admin).settleRoundForced(1, ethers.keccak256("0x"));      
            // 라운드 1 상태가 Claiming으로 변경되었는지 확인
            expect(await main.getRoundStatus(1)).to.equal(3); // Claiming
        });

        it("당첨자가 없을 때 다음 라운드에서 이월된 금액으로 Agent를 민팅할 수 있어야 한다", async function () {
            await main.connect(admin).settleRoundForced(1, ethers.keccak256("0x")); // 라운드 1 정산 (당첨자 없음)
            await startRoundWithSignature(main, rng, admin, 2); // 라운드 2 시작
            
            const round2InitialSettleInfo = await main.roundSettleManageInfo(2); // 라운드 2의 초기 depositedAmount 확인 (이월된 금액)

            // ✅ 정책 변경 반영: 100% 이월
            const expectedCarriedAmount = round1DepositedAmount; // 100%
            expect(round2InitialSettleInfo.depositedAmount).to.equal(expectedCarriedAmount);

            // user2가 Agent를 민팅 (이월된 금액 + 신규 민팅비)
            const user2ItemPartsIds = await collectRequiredParts(itemParts, user2);
            await mintAgent(main, token, rewardPool, user2, user2ItemPartsIds);

            // ✅ 데시멀 반영: 1 토큰 단위 계산
            const decimals = await token.decimals();
            const oneToken = ethers.parseUnits("1", decimals);

            // 라운드 2의 총 depositedAmount 확인 (이월된 금액 + 새로운 민팅비)
            const round2AfterMintSettleInfo = await main.roundSettleManageInfo(2);
            expect(round2AfterMintSettleInfo.depositedAmount).to.equal(expectedCarriedAmount + oneToken);

            // Agent가 정상적으로 민팅되었는지 확인
            expect(await agent.balanceOf(user2.address)).to.equal(1);
        });

        it("당첨자가 없을 때 정산 후 30일 지나면 라운드가 종료되어야 한다", async function () {
            await main.connect(admin).settleRoundForced(1, ethers.keccak256("0x"));      
            // 30일(2592000초) 증가
            await ethers.provider.send("evm_increaseTime", [2592000]);
            await ethers.provider.send("evm_mine");
            // endRound 호출로 상태 전이 트리거
            await main.connect(admin).endRound(1);
            // 라운드 1이 Ended 상태로 변경되었는지 확인
            expect(await main.getRoundStatus(1)).to.equal(5); // Ended
        });
    });
}); 