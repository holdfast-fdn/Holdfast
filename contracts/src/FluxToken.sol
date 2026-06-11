// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title FluxToken — the economic medium of Holdfast (ERC-20, 18 decimals)
/// @notice Deliberately minimal and dependency-free: the settlement contract
///         is the sole minter (set once), anyone may burn their own balance.
///         No hooks, no pausing, no upgradability — the token is dumb on
///         purpose; all game logic lives behind the settlement contract.
contract FluxToken {
    string public constant name = "Flux";
    string public constant symbol = "FLUX";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @notice deployer; only role is to wire the minter once.
    address public immutable owner;
    /// @notice the settlement contract; sole emission source.
    address public minter;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed holder, address indexed spender, uint256 value);
    event MinterSet(address indexed minter);

    error NotOwner();
    error NotMinter();
    error MinterAlreadySet();
    error ZeroAddress();

    constructor() {
        owner = msg.sender;
    }

    /// @notice One-shot wiring of the settlement contract as minter.
    function setMinter(address minter_) external {
        if (msg.sender != owner) revert NotOwner();
        if (minter != address(0)) revert MinterAlreadySet();
        if (minter_ == address(0)) revert ZeroAddress();
        minter = minter_;
        emit MinterSet(minter_);
    }

    /// @notice Emission — settlement only (tile yield + garrison regen).
    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        if (to == address(0)) revert ZeroAddress();
        totalSupply += amount;
        unchecked {
            balanceOf[to] += amount; // cannot exceed totalSupply
        }
        emit Transfer(address(0), to, amount);
    }

    /// @notice The sink — burn your own balance (settlement burns war losses).
    function burn(uint256 amount) external {
        balanceOf[msg.sender] -= amount; // checked: reverts on insufficient
        unchecked {
            totalSupply -= amount; // sum of balances never exceeds supply
        }
        emit Transfer(msg.sender, address(0), amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        return _transfer(msg.sender, to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount)
        external
        returns (bool)
    {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount; // checked
        }
        return _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount)
        internal
        returns (bool)
    {
        if (to == address(0)) revert ZeroAddress(); // use burn() instead
        balanceOf[from] -= amount; // checked: reverts on insufficient
        unchecked {
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
        return true;
    }
}
