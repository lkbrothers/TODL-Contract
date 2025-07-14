/**
 * @file Main.test.js
 * @notice Main 컨트랙트의 Function 테스트 수행
 * @author hlibbc
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

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
 * @dev Agent 민팅을 위해 필요한 ItemParts와 STT 토큰을 소각하고 Agent NFT를 발행한다.
 * @param {*} main Main 컨트랙트 오브젝트
 * @param {*} sttToken STT 토큰 컨트랙트 오브젝트
 * @param {*} rewardPool RewardPool 컨트랙트 오브젝트
 * @param {*} user Agent를 민팅할 사용자 주소
 * @param {*} itemPartsIds Agent 민팅에 사용할 ItemParts 토큰 ID 배열
 * @returns Agent 민팅 트랜잭션 결과
 */
async function mintAgent(main, sttToken, rewardPool, user, itemPartsIds) {
    const currentBlockTime = await ethers.provider.getBlock("latest").then(block => block.timestamp);
    const deadline = currentBlockTime + 172800; // 블록체인 시간 기준
    
    // Permit 서명 생성
    const domain = {
        name: await sttToken.name(),
        version: '1',
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: await sttToken.getAddress()
    };
    
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
        owner: user.address,
        spender: await rewardPool.getAddress(),
        value: ethers.parseEther("1"),
        nonce: await sttToken.nonces(user.address),
        deadline: deadline
    };
    
    const signature = await user.signTypedData(domain, types, message);
    
    // Agent 민팅 실행
    return await main.connect(user).buyAgent(itemPartsIds, deadline, signature);
}

describe("Main Contract", function () {
    let main, itemParts, agent, rng, rewardPool, stakePool, reserv, sttToken;
    let owner, admin, carrier, donateAddr, corporateAddr, operationAddr, user1, user2, user3;
    let managedContracts;

    beforeEach(async function () {
        [owner, admin, carrier, donateAddr, corporateAddr, operationAddr, user1, user2, user3] = await ethers.getSigners();

        // 컨트랙트 배포
        const Main = await ethers.getContractFactory("Main");
        const ItemParts = await ethers.getContractFactory("ItemPartsNFT");
        const Agent = await ethers.getContractFactory("AgentNFT");
        const Rng = await ethers.getContractFactory("Rng");
        const RewardPool = await ethers.getContractFactory("RewardPool");
        const StakePool = await ethers.getContractFactory("StakePool");
        const Reserv = await ethers.getContractFactory("Reserv");
        const SttToken = await ethers.getContractFactory("SttPermit");

        // STT 토큰 먼저 배포
        sttToken = await SttToken.deploy();
        await sttToken.waitForDeployment();
        let sttAddr = await sttToken.getAddress();

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
        rewardPool = await RewardPool.deploy(mainAddr, sttAddr);
        await rewardPool.waitForDeployment();
        stakePool = await StakePool.deploy(sttAddr);
        await stakePool.waitForDeployment();
        reserv = await Reserv.deploy(sttAddr);
        await reserv.waitForDeployment();

        // managedContracts 설정
        managedContracts = await Promise.all([
            itemParts.getAddress(),
            agent.getAddress(),
            rng.getAddress(),
            rewardPool.getAddress(),
            stakePool.getAddress(),
            reserv.getAddress(),
            sttToken.getAddress()
        ]);
        await main.setContracts(managedContracts);

        // 사용자들에게 STT 토큰 지급
        await sttToken.transfer(user1.address, ethers.parseEther("1000"));
        await sttToken.transfer(user2.address, ethers.parseEther("1000"));
        await sttToken.transfer(user3.address, ethers.parseEther("1000"));
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
            expect(await main.managedContracts(7)).to.equal(await sttToken.getAddress());
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

    describe("STT 잔액 조회", function () {
        it("사용자의 STT 잔액을 조회할 수 있어야 한다", async function () {
            const balance = await main.getCoinBalance(user1.address);
            expect(balance).to.equal(ethers.parseEther("1000"));
        });
    });

    describe("Agent 구매", function () {
        it("Agent를 구매할 수 있어야 한다", async function () {
            // user1에게 각 부위별 ItemParts 지급 (Head, Body, Legs, Rhand, Lhand)
            const user1Tokens = await collectRequiredParts(itemParts, user1);
            await startRoundWithSignature(main, rng, admin); // 라운드를 진행중 상태로 변경
            const user1ItemPartsIds = user1Tokens.slice(0, 5); // 처음 5개 토큰 사용
            await mintAgent(main, sttToken, rewardPool, user1, user1ItemPartsIds);
            
            // Agent가 민팅되었는지 확인
            expect(await agent.balanceOf(user1.address)).to.equal(1);
        });

        it("라운드가 진행중이 아니면 Agent를 구매할 수 없어야 한다", async function () {
            // user1에게 각 부위별 ItemParts 지급 (Head, Body, Legs, Rhand, Lhand)
            const user1Tokens = await collectRequiredParts(itemParts, user1);
            await startRoundWithSignature(main, rng, admin); // 라운드를 진행중 상태로 변경
            const user1ItemPartsIds = user1Tokens.slice(0, 5); // 처음 5개 토큰 사용
            await mintAgent(main, sttToken, rewardPool, user1, user1ItemPartsIds);

            // 23시간 증가 (82800초 = 23시간)
            await ethers.provider.send("evm_increaseTime", [82800]);
            await ethers.provider.send("evm_mine");

            // 라운드를 세일종료 상태로 변경
            await main.connect(user1).closeTicketRound();

            // user2가 Agent 발행을 위해 Parts 수집
            const user2Tokens = await collectRequiredParts(itemParts, user2);
            const user2ItemPartsIds = user2Tokens.slice(0, 5); // 처음 5개 토큰 사용
            
            await expect(mintAgent(main, sttToken, rewardPool, user2, user2ItemPartsIds))
                .to.be.revertedWith("Round is not proceeding");
        });

        it("STT 잔액이 부족하면 Agent를 구매할 수 없어야 한다", async function () {
            // 사용자의 STT 잔액을 0으로 만듦
            await sttToken.connect(user1).transfer(user2, await sttToken.balanceOf(user1.address));
            
            const user1Tokens = await collectRequiredParts(itemParts, user1);
            await startRoundWithSignature(main, rng, admin); // 라운드를 진행중 상태로 변경
            const user1ItemPartsIds = user1Tokens.slice(0, 5); // 처음 5개 토큰 사용
            await expect(mintAgent(main, sttToken, rewardPool, user1, user1ItemPartsIds))
                .to.be.revertedWithCustomError(main, "InsufficientCoin");
        });

        it("올바르지 않은 ItemParts로 Agent를 구매할 수 없어야 한다", async function () {
            const user1Tokens = await collectRequiredParts(itemParts, user1);
            await startRoundWithSignature(main, rng, admin); // 라운드를 진행중 상태로 변경
            
            const invalidItemPartsIds = [...user1Tokens.slice(0, 4), user1Tokens[0]]; // user2의 첫 번째 부위 토큰 포함
            await expect(mintAgent(main, sttToken, rewardPool, user1, invalidItemPartsIds))
                .to.be.revertedWithCustomError(main, "InvalidParts");
        });

        it("소유하지 않은 ItemParts로 Agent를 구매할 수 없어야 한다", async function () {
            const user1Tokens = await collectRequiredParts(itemParts, user1);
            await startRoundWithSignature(main, rng, admin); // 라운드를 진행중 상태로 변경
            
            // user2가 소유한 ItemParts를 user1이 사용하려고 시도
            const user2Tokens = await collectRequiredParts(itemParts, user2);

            const invalidItemPartsIds = [...user1Tokens.slice(0, 4), user2Tokens[0]]; // user2의 첫 번째 부위 토큰 포함
            await expect(mintAgent(main, sttToken, rewardPool, user1, invalidItemPartsIds))
                .to.be.revertedWithCustomError(main, "NotItemPartsOwner");
        });
    });

    describe("라운드 세일 종료", function () {
        it("Agent 소유자가 라운드 세일을 종료할 수 있어야 한다", async function () {
            await startRoundWithSignature(main, rng, admin);

            // collectRequiredParts 함수를 사용하여 필요한 ItemParts 수집
            const itemPartsIds = await collectRequiredParts(itemParts, user1);
            
            await mintAgent(main, sttToken, rewardPool, user1, itemPartsIds);
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

        it("Agent를 소유하지 않은 사용자는 라운드 세일을 종료할 수 없어야 한다", async function () {
            await startRoundWithSignature(main, rng, admin);
            
            await ethers.provider.send("evm_increaseTime", [82800]);
            await ethers.provider.send("evm_mine");
            
            await expect(main.connect(user2).closeTicketRound())
                .to.be.revertedWith("Not Owned Agent");
        });
    });

    describe("라운드 정산", function () {
        beforeEach(async function () {
            await startRoundWithSignature(main, rng, admin);
            
            // collectRequiredParts 함수를 사용하여 필요한 ItemParts 수집
            const itemPartsIds = await collectRequiredParts(itemParts, user1);
            
            await mintAgent(main, sttToken, rewardPool, user1, itemPartsIds);
            
            await ethers.provider.send("evm_increaseTime", [82800]);
            await ethers.provider.send("evm_mine");
            await main.connect(user1).closeTicketRound();
        });

        it("admin이 라운드를 정산할 수 있어야 한다", async function () {
            await ethers.provider.send("evm_increaseTime", [3600]);
            await ethers.provider.send("evm_mine");
            
            await main.connect(admin).settleRound(5);
            expect(await main.getRoundStatus(1)).to.equal(3); // Claiming
        });

        it("admin이 아닌 계정은 라운드를 정산할 수 없어야 한다", async function () {
            await ethers.provider.send("evm_increaseTime", [86400]);
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
        beforeEach(async function () {
            await startRoundWithSignature(main, rng, admin);
            
            // collectRequiredParts 함수를 사용하여 필요한 ItemParts 수집
            const itemPartsIds = await collectRequiredParts(itemParts, user1);
            
            await mintAgent(main, sttToken, rewardPool, user1, itemPartsIds);
            
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");
            await main.connect(user1).closeTicketRound();
            
            await ethers.provider.send("evm_increaseTime", [86400]);
            await ethers.provider.send("evm_mine");
            await main.connect(admin).settleRound(5);
        });

        it("당첨 Agent 소유자가 당첨금을 수령할 수 있어야 한다", async function () {
            const agentId = 0; // 첫 번째 Agent
            const initialBalance = await sttToken.balanceOf(user1.address);
            
            await main.connect(user1).claim(1, agentId);
            
            // Agent가 소각되었는지 확인
            expect(await agent.balanceOf(user1.address)).to.equal(0);
        });

        it("Agent 소유자가 아닌 사용자는 당첨금을 수령할 수 없어야 한다", async function () {
            const agentId = 0;
            
            await expect(main.connect(user2).claim(1, agentId))
                .to.be.revertedWith("claim: Not owner");
        });

        it("당첨 Agent가 아니면 당첨금을 수령할 수 없어야 한다", async function () {
            // 다른 Agent를 생성
            const itemPartsIds2 = await collectRequiredParts(itemParts, user2);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const signature = await user2.signTypedData(
                {
                    name: await sttToken.name(),
                    version: '1',
                    chainId: await ethers.provider.getNetwork().then(n => n.chainId),
                    verifyingContract: await sttToken.getAddress()
                },
                {
                    Permit: [
                        { name: 'owner', type: 'address' },
                        { name: 'spender', type: 'address' },
                        { name: 'value', type: 'uint256' },
                        { name: 'nonce', type: 'uint256' },
                        { name: 'deadline', type: 'uint256' }
                    ]
                },
                {
                    owner: user2.address,
                    spender: await rewardPool.getAddress(),
                    value: ethers.parseEther("1"),
                    nonce: await sttToken.nonces(user2.address),
                    deadline: deadline
                }
            );
            
            await main.connect(user2).buyAgent(itemPartsIds2, deadline, signature);
            
            const agentId = 1; // 두 번째 Agent
            
            await expect(main.connect(user2).claim(1, agentId))
                .to.be.revertedWith("claim: Not winner");
        });

        it("라운드가 Claiming 상태가 아니면 당첨금을 수령할 수 없어야 한다", async function () {
            const agentId = 0;
            
            // 라운드를 종료 상태로 변경
            await main.connect(admin).endRound(1);
            
            await expect(main.connect(user1).claim(1, agentId))
                .to.be.revertedWith("claim: Not winner");
        });
    });

    describe("환불", function () {
        beforeEach(async function () {
            await startRoundWithSignature(main, rng, admin);
            
            // collectRequiredParts 함수를 사용하여 필요한 ItemParts 수집
            const itemPartsIds = await collectRequiredParts(itemParts, user1);
            
            await mintAgent(main, sttToken, rewardPool, user1, itemPartsIds);
        });

        it("환불 시간이 지나면 Agent를 환불할 수 있어야 한다", async function () {
            // 환불 가능 시간으로 설정 (ROUND_REFUND_AVAIL_TIME 이후)
            await ethers.provider.send("evm_increaseTime", [172800]); // 48시간 증가
            await ethers.provider.send("evm_mine");
            
            const agentId = 0;
            const initialBalance = await sttToken.balanceOf(user1.address);
            
            await main.connect(user1).refund(1, agentId);
            
            // Agent가 소각되었는지 확인
            expect(await agent.balanceOf(user1.address)).to.equal(0);
        });

        it("환불 시간이 지나지 않으면 환불할 수 없어야 한다", async function () {
            const agentId = 0;
            
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
    });

    describe("라운드 종료", function () {
        beforeEach(async function () {
            await main.connect(admin).startRound("0x");
        });

        it("admin이 라운드를 종료할 수 있어야 한다", async function () {
            // 라운드 종료 가능 시간으로 설정
            await ethers.provider.send("evm_increaseTime", [259200]); // 72시간 증가
            await ethers.provider.send("evm_mine");
            
            await main.connect(admin).endRound(1);
            expect(await main.getRoundStatus(1)).to.equal(4); // Ended
        });

        it("admin이 아닌 계정은 라운드를 종료할 수 없어야 한다", async function () {
            await ethers.provider.send("evm_increaseTime", [259200]);
            await ethers.provider.send("evm_mine");
            
            await expect(main.connect(user1).endRound(1))
                .to.be.revertedWithCustomError(main, "NotAdmin");
        });

        it("라운드가 NotStarted 상태면 종료할 수 없어야 한다", async function () {
            await expect(main.connect(admin).endRound(0))
                .to.be.revertedWithCustomError(main, "EndRoundNotAllowed");
        });

        it("라운드가 이미 Ended 상태면 종료할 수 없어야 한다", async function () {
            await ethers.provider.send("evm_increaseTime", [259200]);
            await ethers.provider.send("evm_mine");
            await main.connect(admin).endRound(1);
            
            await expect(main.connect(admin).endRound(1))
                .to.be.revertedWithCustomError(main, "EndRoundNotAllowed");
        });

        

        it("startRound 수행 후 endRound로 라운드를 종료하면 Agent 민팅이 불가능해야 한다", async function () {
            // startRoundWithSignature 함수를 사용하여 라운드 시작
            await startRoundWithSignature(main, rng, admin);
            expect(await main.getRoundStatus(1)).to.equal(1); // Proceeding
            
            // 30일 후로 시간을 증가시켜 endRound 가능하게 함
            await ethers.provider.send("evm_increaseTime", [2592000]); // 30일 증가
            await ethers.provider.send("evm_mine");
            
            // endRound를 호출하여 라운드 종료
            await main.connect(admin).endRound(1);
            expect(await main.getRoundStatus(1)).to.equal(4); // Ended
            
            // collectRequiredParts 함수를 사용하여 필요한 ItemParts 수집
            const itemPartsIds = await collectRequiredParts(itemParts, user2);
            
            // 라운드가 Ended 상태이므로 Agent 민팅이 실패해야 함
            await expect(mintAgent(main, sttToken, rewardPool, user2, itemPartsIds))
                .to.be.revertedWith("Round is not proceeding");
        });
    });
}); 