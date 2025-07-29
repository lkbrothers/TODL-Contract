const { ethers } = require("hardhat");
const { expect } = require("chai");

// 테스트 헬퍼 함수들
const testHelpers = {
    time: {
        // 현재 블록 타임스탬프 가져오기
        getCurrentTimestamp: async () => {
            const block = await ethers.provider.getBlock("latest");
            return block.timestamp;
        },
        
        // 시간 증가
        increaseTime: async (seconds) => {
            await ethers.provider.send("evm_increaseTime", [seconds]);
            await ethers.provider.send("evm_mine");
        },
        
        // 특정 시간으로 설정
        setNextBlockTimestamp: async (timestamp) => {
            await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
            await ethers.provider.send("evm_mine");
        }
    },
    
    // 랜덤 값 생성
    random: {
        bytes: (length) => ethers.randomBytes(length),
        address: () => ethers.Wallet.createRandom().address,
        uint256: () => ethers.randomBytes(32)
    },
    
    // 서명 생성 (간단한 버전)
    signature: {
        createPermitSignature: async (owner, spender, value, nonce, deadline) => {
            // 실제로는 더 복잡한 서명 생성 로직이 필요
            return ethers.randomBytes(65);
        }
    },

    // 이벤트 검증 헬퍼
    expectEvent: (tx, eventName, args = {}) => {
        const event = tx.logs?.find(log => {
            try {
                const parsed = ethers.Interface.parseLog(log);
                return parsed.name === eventName;
            } catch {
                return false;
            }
        });
        expect(event).to.not.be.undefined;
        
        if (event) {
            const parsed = ethers.Interface.parseLog(event);
            for (const [key, value] of Object.entries(args)) {
                expect(parsed.args[key]).to.equal(value);
            }
        }
    },

    // 에러 검증 헬퍼
    expectRevert: async (promise, errorMessage) => {
        try {
            await promise;
            expect.fail("Expected revert but transaction succeeded");
        } catch (error) {
            if (errorMessage) {
                expect(error.message).to.include(errorMessage);
            }
        }
    },

    // NFT 관련 헬퍼
    nft: {
        mintItemParts: async (itemParts, user, partsId, originId, setNumId, rarity) => {
            return await itemParts.mint(user.address, partsId, originId, setNumId, rarity);
        },
        
        mintAgent: async (agent, user, roundId, itemPartsIds) => {
            return await agent.mint(user.address, roundId, itemPartsIds);
        }
    },

    // 토큰 관련 헬퍼
    token: {
        mintSTT: async (sttToken, user, amount) => {
            return await sttToken.mint(user.address, amount);
        },
        
        approve: async (token, spender, amount) => {
            return await token.approve(spender, amount);
        }
    }
};

module.exports = {
    testHelpers
};
