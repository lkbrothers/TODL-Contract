/**
 * @file ItemParts.test.js
 * @notice ItemParts NFT 컨트랙트의 독립적인 기능 테스트 수행
 * @author hlibbc
 */
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ItemParts NFT Contract", function () {
    let itemParts;
    let owner, user1, user2, user3;
    let mockMainAddr;

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();
        mockMainAddr = user3.address; // 테스트용 Mock Main 주소

        // ItemParts 컨트랙트 배포
        const ItemParts = await ethers.getContractFactory("ItemPartsNFT");
        itemParts = await ItemParts.deploy(mockMainAddr);
        await itemParts.waitForDeployment();
    });

    describe("초기화", function () {
        it("컨트랙트가 올바르게 초기화되어야 한다", async function () {
            expect(await itemParts.mainAddr()).to.equal(mockMainAddr);
            expect(await itemParts.totalSupply()).to.equal(0);
            expect(await itemParts.mintAtTime()).to.equal(5); // MINT_AT_TIME
            expect(await itemParts.maxMintsPerDay()).to.equal(50); // MAX_FREE_MINTS_PER_DAY
            expect(await itemParts.baseUri()).to.equal("https://dev.todl.fun/api/file-download/json/");
            expect(await itemParts.owner()).to.equal(owner.address);
        });

        it("초기 parts 배열이 올바르게 설정되어야 한다", async function () {
            expect(await itemParts.parts(0)).to.equal("Head");
            expect(await itemParts.parts(1)).to.equal("Body");
            expect(await itemParts.parts(2)).to.equal("Legs");
            expect(await itemParts.parts(3)).to.equal("RHand");
            expect(await itemParts.parts(4)).to.equal("LHand");
        });

        it("초기 origins 배열이 올바르게 설정되어야 한다", async function () {
            expect(await itemParts.origins(0)).to.equal("TODL");
            expect(await itemParts.origins(1)).to.equal("Earthling");
            expect(await itemParts.origins(2)).to.equal("BadGen");
        });
    });

    describe("Owner 관리", function () {
        it("owner가 아닌 계정은 관리 함수를 호출할 수 없어야 한다", async function () {
            await expect(itemParts.connect(user1).setMainAddr(user2.address))
                .to.be.revertedWithCustomError(itemParts, "OwnableUnauthorizedAccount");
            
            await expect(itemParts.connect(user1).setValueMintAtTime(3))
                .to.be.revertedWithCustomError(itemParts, "OwnableUnauthorizedAccount");
            
            await expect(itemParts.connect(user1).setValueMaxMintsPerDay(100))
                .to.be.revertedWithCustomError(itemParts, "OwnableUnauthorizedAccount");
            
            await expect(itemParts.connect(user1).setBaseURI("new uri"))
                .to.be.revertedWithCustomError(itemParts, "OwnableUnauthorizedAccount");
        });
    });

    describe("Main 주소 설정", function () {
        it("owner가 Main 주소를 설정할 수 있어야 한다", async function () {
            const newMainAddr = user1.address;
            await itemParts.setMainAddr(newMainAddr);
            expect(await itemParts.mainAddr()).to.equal(newMainAddr);
        });

        it("zero address로 설정할 수 없어야 한다", async function () {
            await expect(itemParts.setMainAddr(ethers.ZeroAddress))
                .to.be.revertedWith("Invalid address");
        });
    });

    describe("민팅 설정", function () {
        it("mintAtTime을 설정할 수 있어야 한다", async function () {
            await itemParts.setValueMintAtTime(3);
            expect(await itemParts.mintAtTime()).to.equal(3);
        });

        it("mintAtTime은 1-9 범위여야 한다", async function () {
            await expect(itemParts.setValueMintAtTime(0))
                .to.be.revertedWithCustomError(itemParts, "MintAtTimeOutOfRange");
            
            await expect(itemParts.setValueMintAtTime(10))
                .to.be.revertedWithCustomError(itemParts, "MintAtTimeOutOfRange");
        });

        it("maxMintsPerDay를 설정할 수 있어야 한다", async function () {
            await itemParts.setValueMaxMintsPerDay(100);
            expect(await itemParts.maxMintsPerDay()).to.equal(100);
        });

        it("maxMintsPerDay는 mintAtTime보다 커야 한다", async function () {
            await itemParts.setValueMintAtTime(5);
            await expect(itemParts.setValueMaxMintsPerDay(3))
                .to.be.revertedWithCustomError(itemParts, "MaxMintsPerDayOutOfRange");
        });
    });

    describe("BaseURI 설정", function () {
        it("BaseURI를 설정할 수 있어야 한다", async function () {
            const newUri = "https://new.uri.com/";
            await itemParts.setBaseURI(newUri);
            expect(await itemParts.baseUri()).to.equal(newUri);
        });

        it("빈 문자열로 설정할 수 없어야 한다", async function () {
            await expect(itemParts.setBaseURI(""))
                .to.be.revertedWith("Invalid args");
        });

        it("같은 URI로 설정할 수 없어야 한다", async function () {
            await expect(itemParts.setBaseURI("https://dev.todl.fun/api/file-download/json/"))
                .to.be.revertedWith("Same Uri");
        });
    });

    describe("배열 설정", function () {
        it("parts 배열을 설정할 수 있어야 한다", async function () {
            const newParts = ["NewHead", "NewBody", "NewLegs"];
            await itemParts.setParts(newParts);
            
            expect(await itemParts.parts(0)).to.equal("NewHead");
            expect(await itemParts.parts(1)).to.equal("NewBody");
            expect(await itemParts.parts(2)).to.equal("NewLegs");
        });

        it("origins 배열을 설정할 수 있어야 한다", async function () {
            const newOrigins = ["NewOrigin1", "NewOrigin2"];
            await itemParts.setOrigins(newOrigins);
            
            expect(await itemParts.origins(0)).to.equal("NewOrigin1");
            expect(await itemParts.origins(1)).to.equal("NewOrigin2");
        });

        it("빈 배열로 설정할 수 없어야 한다", async function () {
            await expect(itemParts.setParts([]))
                .to.be.revertedWith("Invalid args");
            
            await expect(itemParts.setOrigins([]))
                .to.be.revertedWith("Invalid args");
        });
    });

    describe("NFT 민팅", function () {
        it("NFT를 민팅할 수 있어야 한다", async function () {
            const balanceBefore = await itemParts.balanceOf(user1.address);
            const totalSupplyBefore = await itemParts.totalSupply();
            
            await itemParts.connect(user1).mint();
            
            const balanceAfter = await itemParts.balanceOf(user1.address);
            const totalSupplyAfter = await itemParts.totalSupply();
            
            expect(balanceAfter - balanceBefore).to.equal(5); // mintAtTime만큼
            expect(totalSupplyAfter - totalSupplyBefore).to.equal(5);
        });

        it("하루 최대 민팅 개수를 초과하면 안된다", async function () {
            // 하루 최대 50개, 한 번에 5개씩이므로 11번 민팅하면 55개가 되어 초과
            for (let i = 0; i < 11; i++) {
                await itemParts.connect(user1).mint();
            }
            
            await expect(itemParts.connect(user1).mint())
                .to.be.revertedWithCustomError(itemParts, "DailyLimitsExceeded");
        });

        it("민팅된 토큰의 정보가 올바르게 저장되어야 한다", async function () {
            await itemParts.connect(user1).mint();
            
            const tokenId = 1;
            const tokenInfo = await itemParts.tokenInfo(tokenId);
            
            expect(tokenInfo.partsIndex).to.be.gte(0);
            expect(tokenInfo.partsIndex).to.be.lt(5); // parts.length
            expect(tokenInfo.originsIndex).to.be.gte(0);
            expect(tokenInfo.originsIndex).to.be.lt(3); // origins.length
            expect(tokenInfo.setNumsIndex).to.be.gte(0);
            expect(tokenInfo.setNumsIndex).to.be.lt(4); // setNums.length
            expect(tokenInfo.typeHash).to.not.equal(ethers.ZeroHash);
            expect(tokenInfo.typeName).to.not.equal("");
        });

        it("토큰 URI가 올바르게 설정되어야 한다", async function () {
            await itemParts.connect(user1).mint();
            
            const tokenId = 1;
            const tokenURI = await itemParts.tokenURI(tokenId);
            
            expect(tokenURI).to.include("https://dev.todl.fun/api/file-download/json/");
            expect(tokenURI).to.include(".json");
        });
    });

    describe("타입 해시 생성", function () {
        it("올바른 인덱스로 타입 해시를 생성할 수 있어야 한다", async function () {
            const typeHash = await itemParts.getTypeHash(0, 0, 0);
            expect(typeHash).to.not.equal(ethers.ZeroHash);
        });

        it("잘못된 인덱스로 타입 해시를 생성할 수 없어야 한다", async function () {
            await expect(itemParts.getTypeHash(10, 0, 0))
                .to.be.revertedWithCustomError(itemParts, "InvalidTypeIndex");
            
            await expect(itemParts.getTypeHash(0, 10, 0))
                .to.be.revertedWithCustomError(itemParts, "InvalidTypeIndex");
            
            await expect(itemParts.getTypeHash(0, 0, 10))
                .to.be.revertedWithCustomError(itemParts, "InvalidTypeIndex");
        });
    });

    describe("타입명 생성", function () {
        it("올바른 타입명을 생성할 수 있어야 한다", async function () {
            const typeName = await itemParts.makeTypeName(0, 0, 0);
            expect(typeName).to.not.equal("");
        });
    });

    describe("현재 보유 개수 조회", function () {
        it("특정 타입의 현재 보유 개수를 조회할 수 있어야 한다", async function () {
            const count = await itemParts.currentCountOf(0, 0, 0);
            expect(count).to.equal(0); // 초기에는 0개
        });

        it("민팅 후 현재 보유 개수가 증가해야 한다", async function () {
            await itemParts.connect(user1).mint();
            
            // 첫 번째 토큰의 정보를 가져와서 해당 타입의 개수 확인
            const tokenInfo = await itemParts.tokenInfo(1);
            const count = await itemParts.currentCountOf(
                tokenInfo.partsIndex,
                tokenInfo.originsIndex,
                tokenInfo.setNumsIndex
            );
            
            expect(count).to.be.gt(0);
        });
    });

    describe("오늘 남은 민팅 횟수 조회", function () {
        it("초기에는 최대 민팅 횟수만큼 남아있어야 한다", async function () {
            const remaining = await itemParts.getRemainingMintsToday(user1.address);
            expect(remaining).to.equal(50); // MAX_FREE_MINTS_PER_DAY
        });

        it("민팅 후 남은 횟수가 감소해야 한다", async function () {
            const remainingBefore = await itemParts.getRemainingMintsToday(user1.address);
            await itemParts.connect(user1).mint();
            const remainingAfter = await itemParts.getRemainingMintsToday(user1.address);
            
            expect(remainingAfter).to.equal(remainingBefore - 5n); // mintAtTime만큼 감소
        });

        it("여러 번 민팅 후 남은 횟수가 정확히 계산되어야 한다", async function () {
            // 3번 민팅
            for (let i = 0; i < 3; i++) {
                await itemParts.connect(user1).mint();
            }
            
            const remaining = await itemParts.getRemainingMintsToday(user1.address);
            expect(remaining).to.equal(35); // 50 - (3 × 5) = 50 - 15 = 35
        });

        it("최대 횟수에 도달하면 0이 반환되어야 한다", async function () {
            // 최대 횟수만큼 민팅 (10번 = 50개 토큰)
            for (let i = 0; i < 10; i++) {
                await itemParts.connect(user1).mint();
            }
            
            const remaining = await itemParts.getRemainingMintsToday(user1.address);
            expect(remaining).to.equal(0);
        });

        it("최대 횟수를 초과하면 에러가 발생해야 한다", async function () {
            // 최대 횟수만큼 민팅 (10번 = 50개 토큰)
            for (let i = 0; i < 10; i++) {
                await itemParts.connect(user1).mint();
            }
            
            // 11번째 민팅 시도 (성공해야 함)
            await itemParts.connect(user1).mint();
            
            // 12번째 민팅 시도 (에러 발생해야 함)
            await expect(itemParts.connect(user1).mint())
                .to.be.revertedWithCustomError(itemParts, "DailyLimitsExceeded");
        });

        it("다른 사용자의 남은 횟수는 독립적으로 계산되어야 한다", async function () {
            // user1이 3번 민팅
            for (let i = 0; i < 3; i++) {
                await itemParts.connect(user1).mint();
            }
            
            // user2의 남은 횟수는 여전히 최대값이어야 함
            const user2Remaining = await itemParts.getRemainingMintsToday(user2.address);
            expect(user2Remaining).to.equal(50);
            
            // user1의 남은 횟수는 35이어야 함 (50 - 15)
            const user1Remaining = await itemParts.getRemainingMintsToday(user1.address);
            expect(user1Remaining).to.equal(35);
        });

        it("mintAtTime 설정 변경 후에도 정확히 계산되어야 한다", async function () {
            // mintAtTime을 3으로 변경
            await itemParts.setValueMintAtTime(3);
            
            // 1번 민팅 (3개씩 민팅되므로 3개가 생성됨)
            await itemParts.connect(user1).mint();
            
            const remaining = await itemParts.getRemainingMintsToday(user1.address);
            expect(remaining).to.equal(47); // 50 - 3 (3개 토큰이 생성됨)
        });

        it("maxMintsPerDay 설정 변경 후에도 정확히 계산되어야 한다", async function () {
            // maxMintsPerDay를 100으로 변경
            await itemParts.setValueMaxMintsPerDay(100);
            
            const remaining = await itemParts.getRemainingMintsToday(user1.address);
            expect(remaining).to.equal(100);
        });
    });

    describe("Enum 변환 함수", function () {
        it("Parts enum을 문자열로 변환할 수 있어야 한다", async function () {
            // 내부 함수이므로 직접 테스트할 수 없지만, 민팅을 통해 간접적으로 테스트
            await itemParts.connect(user1).mint();
            const tokenInfo = await itemParts.tokenInfo(1);
            const partsNames = ["Head", "Body", "Legs", "RHand", "LHand"];
            expect(partsNames.some(part => tokenInfo.typeName.includes(part))).to.be.true;
        });

        it("Origins enum을 문자열로 변환할 수 있어야 한다", async function () {
            await itemParts.connect(user1).mint();
            const tokenInfo = await itemParts.tokenInfo(1);
            const originsNames = ["TODL", "Earthling", "BadGen"];
            expect(originsNames.some(origin => tokenInfo.typeName.includes(origin))).to.be.true;
        });
    });

    describe("ERC721 기본 기능", function () {
        beforeEach(async function () {
            await itemParts.connect(user1).mint();
        });

        it("토큰 소유자를 조회할 수 있어야 한다", async function () {
            expect(await itemParts.ownerOf(1)).to.equal(user1.address);
        });

        it("토큰을 전송할 수 있어야 한다", async function () {
            await itemParts.connect(user1).transferFrom(user1.address, user2.address, 1);
            expect(await itemParts.ownerOf(1)).to.equal(user2.address);
        });

        it("토큰 승인을 할 수 있어야 한다", async function () {
            await itemParts.connect(user1).approve(user2.address, 1);
            expect(await itemParts.getApproved(1)).to.equal(user2.address);
        });

        it("전체 승인을 할 수 있어야 한다", async function () {
            await itemParts.connect(user1).setApprovalForAll(user2.address, true);
            expect(await itemParts.isApprovedForAll(user1.address, user2.address)).to.equal(true);
        });
    });

    describe("이벤트 발생", function () {
        it("민팅 시 Minted 이벤트가 발생해야 한다", async function () {
            await expect(itemParts.connect(user1).mint())
                .to.emit(itemParts, "Minted");
        });

        it("설정 변경 시 해당 이벤트가 발생해야 한다", async function () {
            await expect(itemParts.setMainAddr(user2.address))
                .to.emit(itemParts, "MainContractUpdated")
                .withArgs(user2.address);
            
            await expect(itemParts.setValueMintAtTime(3))
                .to.emit(itemParts, "MintAtTimeUpdated")
                .withArgs(3);
            
            await expect(itemParts.setBaseURI("new uri"))
                .to.emit(itemParts, "BaseUriUpdated");
        });
    });
}); 