// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import {IXRPPayment} from "@flarenetwork/flare-periphery-contracts/coston2/IXRPPayment.sol";
import {IXRPPaymentNonexistence} from "@flarenetwork/flare-periphery-contracts/coston2/IXRPPaymentNonexistence.sol";

/**
 * @notice TEST ONLY. Stands in for the enshrined FdcVerification contract so the
 *         agreement state machine can be tested locally without a live attestation
 *         round. It implements only the two selectors LatePayShield calls.
 *
 *         It proves nothing about FDC. A green test here is NOT evidence that the
 *         real FDC path works; that requires a real proof on Coston2.
 */
contract MockFdcVerification {
    bool public proofsValid = true;

    function setProofsValid(bool v) external {
        proofsValid = v;
    }

    function verifyXRPPayment(IXRPPayment.Proof calldata) external view returns (bool) {
        return proofsValid;
    }

    function verifyXRPPaymentNonexistence(
        IXRPPaymentNonexistence.Proof calldata
    ) external view returns (bool) {
        return proofsValid;
    }
}
