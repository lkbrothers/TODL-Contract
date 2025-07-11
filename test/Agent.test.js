const { ethers } = require("hardhat");
const { expect } = require("chai");


describe("Agent Contract", function () {
    let agent, itemParts, mockMain;
    let owner, user1, user2, user3;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();
        
        // 컨트랙트 배포 (ethers v6 방식)
        const Agent = await ethers.getContractFactory("AgentNFT");
        const ItemParts = await ethers.getContractFactory("ItemPartsNFT");
        
        itemParts = await ItemParts.deploy(owner.address);
        await itemParts.waitForDeployment();
        
        // Mock Main 컨트랙트 생성
        const MockMain = await ethers.getContractFactory("MockMain");
        mockMain = await MockMain.deploy();
        await mockMain.waitForDeployment();
        
        // Mock Main에 ItemParts 주소 설정
        await mockMain.setManagedContract(1, await itemParts.getAddress()); // Types.ContractTags.ItemParts = 1
        
        agent = await Agent.deploy(await mockMain.getAddress());
        await agent.waitForDeployment();
    });

    describe("초기화", function () {
        it("컨트랙트가 올바르게 초기화되어야 한다", async function () {
            expect(await agent.name()).to.equal("TODL Agent NFT");
            expect(await agent.symbol()).to.equal("AGENT");
        });

        it("Main 컨트랙트 주소가 설정되어야 한다", async function () {
            expect(await agent.mainAddr()).to.equal(await mockMain.getAddress());
        });
    });

    describe("민팅", function () {
        beforeEach(async function () {
            // ItemParts 민팅 (파라미터 없음)
            for (let i = 0; i < 5; i++) {
                await itemParts.connect(user1).mint();
            }
        });

        it("Agent를 민팅할 수 있어야 한다", async function () {
            const roundId = 1;
            const itemPartsIds = [0, 1, 2, 3, 4];
            
            // Main 컨트랙트로부터 호출하는 것처럼 시뮬레이션
            await agent.connect(owner).mint(user1.address, roundId, itemPartsIds);
            
            expect(await agent.balanceOf(user1.address)).to.equal(1);
            expect(await agent.ownerOf(0)).to.equal(user1.address);
        });

        it("여러 Agent를 민팅할 수 있어야 한다", async function () {
            const roundId = 1;
            const itemPartsIds = [0, 1, 2, 3, 4];
            
            // 첫 번째 Agent 민팅
            await agent.connect(owner).mint(user1.address, roundId, itemPartsIds);
            
            // 추가 ItemParts 민팅
            for (let i = 0; i < 5; i++) {
                await itemParts.connect(user1).mint();
            }
            
            // 두 번째 Agent 민팅
            const secondItemPartsIds = [5, 6, 7, 8, 9];
            await agent.connect(owner).mint(user1.address, roundId, secondItemPartsIds);
            
            expect(await agent.balanceOf(user1.address)).to.equal(2);
        });

        it("올바른 개수의 ItemParts가 필요하다", async function () {
            const roundId = 1;
            const wrongItemPartsIds = [0, 1, 2, 3]; // 5개가 아닌 4개
            
            await expect(
                agent.connect(owner).mint(user1.address, roundId, wrongItemPartsIds)
            ).to.be.revertedWith("Incorrect number of ItemParts");
        });

        it("ItemParts 소유자가 아닌 계정은 민팅할 수 없다", async function () {
            const roundId = 1;
            const itemPartsIds = [0, 1, 2, 3, 4];
            
            await expect(
                agent.connect(owner).mint(user2.address, roundId, itemPartsIds)
            ).to.be.revertedWith("ERC721: caller is not token owner or approved");
        });
    });

    describe("토큰 정보", function () {
        beforeEach(async function () {
            // ItemParts 민팅 및 Agent 민팅
            for (let i = 0; i < 5; i++) {
                await itemParts.connect(user1).mint();
            }
            
            const roundId = 1;
            const itemPartsIds = [0, 1, 2, 3, 4];
            await agent.connect(owner).mint(user1.address, roundId, itemPartsIds);
        });

        it("Agent의 라운드 정보를 조회할 수 있어야 한다", async function () {
            expect(await agent.roundOf(0)).to.equal(1);
        });

        it("Agent의 타입 해시를 조회할 수 있어야 한다", async function () {
            const typeHash = await agent.typeOf(0);
            expect(typeHash).to.not.equal(ethers.ZeroHash);
        });

        it("라운드별 특정 타입의 민팅 개수를 조회할 수 있어야 한다", async function () {
            const typeHash = await agent.typeOf(0);
            const [mintCount, totalCount] = await agent.mintTypeCountPerRound(1, typeHash);
            
            expect(mintCount).to.equal(1);
            expect(totalCount).to.equal(1);
        });
    });

    describe("소각", function () {
        beforeEach(async function () {
            // ItemParts 민팅 및 Agent 민팅
            for (let i = 0; i < 5; i++) {
                await itemParts.connect(user1).mint();
            }
            
            const roundId = 1;
            const itemPartsIds = [0, 1, 2, 3, 4];
            await agent.connect(owner).mint(user1.address, roundId, itemPartsIds);
        });

        it("Agent 소유자가 Agent를 소각할 수 있어야 한다", async function () {
            await agent.connect(owner).burn(user1.address, 0);
            
            await expect(agent.ownerOf(0))
                .to.be.revertedWith("ERC721: invalid token ID");
            expect(await agent.balanceOf(user1.address)).to.equal(0);
        });

        it("Agent 소유자가 아닌 계정은 소각할 수 없어야 한다", async function () {
            await expect(
                agent.connect(user2).burn(user1.address, 0)
            ).to.be.revertedWith("ERC721: caller is not token owner or approved");
        });

        it("존재하지 않는 Agent를 소각할 수 없어야 한다", async function () {
            await expect(
                agent.connect(owner).burn(user1.address, 999)
            ).to.be.revertedWith("ERC721: invalid token ID");
        });
    });

    describe("라운드별 조회", function () {
        beforeEach(async function () {
            // 여러 라운드에 Agent 민팅
            for (let round = 1; round <= 3; round++) {
                for (let i = 0; i < 5; i++) {
                    await itemParts.connect(user1).mint();
                }
                
                const itemPartsIds = [
                    round * 10, 
                    round * 10 + 1, 
                    round * 10 + 2, 
                    round * 10 + 3, 
                    round * 10 + 4
                ];
                await agent.connect(owner).mint(user1.address, round, itemPartsIds);
            }
        });

        it("라운드별 Agent 개수를 조회할 수 있어야 한다", async function () {
            expect(await agent.balanceOfPerRound(1, user1.address)).to.equal(1);
            expect(await agent.balanceOfPerRound(2, user1.address)).to.equal(1);
            expect(await agent.balanceOfPerRound(3, user1.address)).to.equal(1);
        });

        it("존재하지 않는 라운드의 개수는 0이어야 한다", async function () {
            expect(await agent.balanceOfPerRound(999, user1.address)).to.equal(0);
        });
    });

    describe("ERC721 표준 기능", function () {
        beforeEach(async function () {
            // ItemParts 민팅 및 Agent 민팅
            for (let i = 0; i < 5; i++) {
                await itemParts.connect(user1).mint();
            }
            
            const roundId = 1;
            const itemPartsIds = [0, 1, 2, 3, 4];
            await agent.connect(owner).mint(user1.address, roundId, itemPartsIds);
        });

        it("transfer가 정상적으로 작동해야 한다", async function () {
            await agent.connect(user1).transferFrom(user1.address, user2.address, 0);
            
            expect(await agent.ownerOf(0)).to.equal(user2.address);
            expect(await agent.balanceOf(user1.address)).to.equal(0);
            expect(await agent.balanceOf(user2.address)).to.equal(1);
        });

        it("approve가 정상적으로 작동해야 한다", async function () {
            await agent.connect(user1).approve(user2.address, 0);
            await agent.connect(user2).transferFrom(user1.address, user3.address, 0);
            
            expect(await agent.ownerOf(0)).to.equal(user3.address);
        });

        it("setApprovalForAll이 정상적으로 작동해야 한다", async function () {
            await agent.connect(user1).setApprovalForAll(user2.address, true);
            await agent.connect(user2).transferFrom(user1.address, user3.address, 0);
            
            expect(await agent.ownerOf(0)).to.equal(user3.address);
        });
    });
}); 