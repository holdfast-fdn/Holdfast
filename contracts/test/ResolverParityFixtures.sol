// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice GENERATED FILE — do not edit by hand.
///         Source of truth: sim/resolver_fixed.py (the fixed-point spec).
///         Regenerate: cd sim && python3 gen_parity_fixtures.py
library ResolverParityFixtures {
    struct Case {
        uint256 committed;
        uint256 attackerMod;
        uint256 garrison;
        uint256 defenderMod;
        uint256 delta;
        uint256 gamma;
        uint256 beta;
        uint256 randomWord;
        bool expWon;
        uint256 expPWad;
        uint256 expRoll;
        uint256 expToAttacker;
        uint256 expToDefender;
        uint256 expBurned;
        uint256 expNewGarrison;
    }

    function load() internal pure returns (Case[] memory cs) {
        cs = new Case[](87);
        // empty tile: attacker always wins
        cs[0] = Case({
            committed: 100000000000000000000,
            attackerMod: 1000000000000000000,
            garrison: 0,
            defenderMod: 1000000000000000000,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 12345,
            expWon: true,
            expPWad: 1000000000000000000,
            expRoll: 12345,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 0,
            expNewGarrison: 100000000000000000000
        });
        // zero commit vs garrison: defender holds
        cs[1] = Case({
            committed: 0,
            attackerMod: 1000000000000000000,
            garrison: 100000000000000000000,
            defenderMod: 1000000000000000000,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 0,
            expWon: false,
            expPWad: 0,
            expRoll: 0,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 0,
            expNewGarrison: 100000000000000000000
        });
        // both zero: p=0, defender holds
        cs[2] = Case({
            committed: 0,
            attackerMod: 1000000000000000000,
            garrison: 0,
            defenderMod: 1000000000000000000,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 999,
            expWon: false,
            expPWad: 0,
            expRoll: 999,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 0,
            expNewGarrison: 0
        });
        // 1 wei commit vs 1 wei garrison
        cs[3] = Case({
            committed: 1,
            attackerMod: 1000000000000000000,
            garrison: 1,
            defenderMod: 1000000000000000000,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 7,
            expWon: true,
            expPWad: 434782608695652173,
            expRoll: 7,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 1,
            expNewGarrison: 1
        });
        // whale vs 1 wei
        cs[4] = Case({
            committed: 1000000000000000000000000000,
            attackerMod: 1000000000000000000,
            garrison: 1,
            defenderMod: 1000000000000000000,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 3,
            expWon: true,
            expPWad: 999999999999958890,
            expRoll: 3,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 1,
            expNewGarrison: 1000000000000000000000000000
        });
        // perfect squares 4 vs 1
        cs[5] = Case({
            committed: 4000000000000000000,
            attackerMod: 1000000000000000000,
            garrison: 1000000000000000000,
            defenderMod: 1000000000000000000,
            delta: 1000000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 42,
            expWon: true,
            expPWad: 666666666666666666,
            expRoll: 42,
            expToAttacker: 300000000000000000,
            expToDefender: 0,
            expBurned: 700000000000000000,
            expNewGarrison: 4000000000000000000
        });
        // max modifiers
        cs[6] = Case({
            committed: 250000000000000000000,
            attackerMod: 2000000000000000000,
            garrison: 250000000000000000000,
            defenderMod: 2000000000000000000,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 57896044618658097711785492504343953926634992332820282019728792003956564819968,
            expWon: false,
            expPWad: 434782608695652173,
            expRoll: 792003956564819968,
            expToAttacker: 0,
            expToDefender: 75000000000000000000,
            expBurned: 175000000000000000000,
            expNewGarrison: 250000000000000000000
        });
        // roll = 0 always wins when p>0
        cs[7] = Case({
            committed: 100000000000000000000,
            attackerMod: 1000000000000000000,
            garrison: 100000000000000000000,
            defenderMod: 1000000000000000000,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 0,
            expWon: true,
            expPWad: 434782608695652173,
            expRoll: 0,
            expToAttacker: 30000000000000000000,
            expToDefender: 0,
            expBurned: 70000000000000000000,
            expNewGarrison: 100000000000000000000
        });
        // randomWord = WAD-1 (roll = WAD-1, loses: p<WAD)
        cs[8] = Case({
            committed: 100000000000000000000,
            attackerMod: 1000000000000000000,
            garrison: 100000000000000000000,
            defenderMod: 1000000000000000000,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 999999999999999999,
            expWon: false,
            expPWad: 434782608695652173,
            expRoll: 999999999999999999,
            expToAttacker: 0,
            expToDefender: 30000000000000000000,
            expBurned: 70000000000000000000,
            expNewGarrison: 100000000000000000000
        });
        // randomWord = multiple of WAD (roll wraps to 0)
        cs[9] = Case({
            committed: 100000000000000000000,
            attackerMod: 1000000000000000000,
            garrison: 100000000000000000000,
            defenderMod: 1000000000000000000,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 5000000000000000000,
            expWon: true,
            expPWad: 434782608695652173,
            expRoll: 0,
            expToAttacker: 30000000000000000000,
            expToDefender: 0,
            expBurned: 70000000000000000000,
            expNewGarrison: 100000000000000000000
        });
        // boundary roll == pWad: defender holds
        cs[10] = Case({
            committed: 180000000000000000000,
            attackerMod: 1000000000000000000,
            garrison: 120000000000000000000,
            defenderMod: 1000000000000000000,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 485096488468767178,
            expWon: false,
            expPWad: 485096488468767178,
            expRoll: 485096488468767178,
            expToAttacker: 0,
            expToDefender: 54000000000000000000,
            expBurned: 126000000000000000000,
            expNewGarrison: 120000000000000000000
        });
        // boundary roll == pWad-1: attacker wins
        cs[11] = Case({
            committed: 180000000000000000000,
            attackerMod: 1000000000000000000,
            garrison: 120000000000000000000,
            defenderMod: 1000000000000000000,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 485096488468767177,
            expWon: true,
            expPWad: 485096488468767178,
            expRoll: 485096488468767177,
            expToAttacker: 36000000000000000000,
            expToDefender: 0,
            expBurned: 84000000000000000000,
            expNewGarrison: 180000000000000000000
        });
        // random 0
        cs[12] = Case({
            committed: 4250522376539887859723712,
            attackerMod: 617120382302146150,
            garrison: 342002808109261212810436,
            defenderMod: 1629055312873756117,
            delta: 1300000000000000000,
            gamma: 500000000000000000,
            beta: 500000000000000000,
            randomWord: 39141190374113843461898662281894209002692662524454656606054609984411479740496,
            expWon: false,
            expPWad: 506732941909154042,
            expRoll: 609984411479740496,
            expToAttacker: 0,
            expToDefender: 2125261188269943929861856,
            expBurned: 2125261188269943929861856,
            expNewGarrison: 342002808109261212810436
        });
        // random 1
        cs[13] = Case({
            committed: 2144423995757377949780054,
            attackerMod: 820845754362443296,
            garrison: 311501519522751086281722,
            defenderMod: 898099923062164878,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 90089218531087033929158364576093104367575049703237201787256219102433754884558,
            expWon: true,
            expPWad: 648465430324537489,
            expRoll: 219102433754884558,
            expToAttacker: 93450455856825325884516,
            expToDefender: 0,
            expBurned: 218051063665925760397206,
            expNewGarrison: 2144423995757377949780054
        });
        // random 2
        cs[14] = Case({
            committed: 1395725685728014030487890,
            attackerMod: 1169686294811927160,
            garrison: 2027363668357167539885784,
            defenderMod: 1000464465015426098,
            delta: 1000000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 26795591070491014950316585531261124015984128638272213572128024486531556180169,
            expWon: true,
            expPWad: 492403170213363955,
            expRoll: 24486531556180169,
            expToAttacker: 608209100507150261965735,
            expToDefender: 0,
            expBurned: 1419154567850017277920049,
            expNewGarrison: 1395725685728014030487890
        });
        // random 3
        cs[15] = Case({
            committed: 1634505568389090219835321,
            attackerMod: 1507958280477219815,
            garrison: 2261537780718276963842252,
            defenderMod: 1973581228926934831,
            delta: 1300000000000000000,
            gamma: 1000000000000000000,
            beta: 0,
            randomWord: 45653412189247275191492726240542896510300055255997837363691791736963476159439,
            expWon: false,
            expPWad: 333186108215794257,
            expRoll: 791736963476159439,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 1634505568389090219835321,
            expNewGarrison: 2261537780718276963842252
        });
        // random 4
        cs[16] = Case({
            committed: 4101912878361050936142592,
            attackerMod: 695901322998768407,
            garrison: 2737286326566325470921623,
            defenderMod: 1664318153527829749,
            delta: 1300000000000000000,
            gamma: 0,
            beta: 0,
            randomWord: 2037131809853474751694439985983616518897132721059836342517576779422258362559,
            expWon: false,
            expPWad: 282502107166223156,
            expRoll: 576779422258362559,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 4101912878361050936142592,
            expNewGarrison: 2737286326566325470921623
        });
        // random 5
        cs[17] = Case({
            committed: 1970692876142539858602597,
            attackerMod: 1660358828811611101,
            garrison: 4327104457997868033593395,
            defenderMod: 1907023093252213173,
            delta: 1300000000000000000,
            gamma: 500000000000000000,
            beta: 500000000000000000,
            randomWord: 66556716840932819100416308530795644218664080880380024431623035647107761313252,
            expWon: true,
            expPWad: 311282424752238030,
            expRoll: 35647107761313252,
            expToAttacker: 2163552228998934016796697,
            expToDefender: 0,
            expBurned: 2163552228998934016796698,
            expNewGarrison: 1970692876142539858602597
        });
        // random 6
        cs[18] = Case({
            committed: 495817388763628008372192,
            attackerMod: 567780857257976116,
            garrison: 2238039291936160884464814,
            defenderMod: 1949592926405766897,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 37012628299772009341670316111198383539376548822024048618709954995061539794739,
            expWon: false,
            expPWad: 95385830022655074,
            expRoll: 954995061539794739,
            expToAttacker: 0,
            expToDefender: 148745216629088402511657,
            expBurned: 347072172134539605860535,
            expNewGarrison: 2238039291936160884464814
        });
        // random 7
        cs[19] = Case({
            committed: 2345876489238870520863923,
            attackerMod: 523287398278669525,
            garrison: 3811887338085341858930683,
            defenderMod: 1723145533535060513,
            delta: 1000000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 1305095265170951238734450454490478534853307352081906280934051025924469765102,
            expWon: true,
            expPWad: 192397174732441432,
            expRoll: 51025924469765102,
            expToAttacker: 1143566201425602557679204,
            expToDefender: 0,
            expBurned: 2668321136659739301251479,
            expNewGarrison: 2345876489238870520863923
        });
        // random 8
        cs[20] = Case({
            committed: 3111094252332708278845559,
            attackerMod: 677746053872391358,
            garrison: 3390433053315860134011317,
            defenderMod: 1446111770873147214,
            delta: 1300000000000000000,
            gamma: 1000000000000000000,
            beta: 0,
            randomWord: 67727279515490469041438002090173370588694921857158244552475821856099038170234,
            expWon: false,
            expPWad: 256695187392006330,
            expRoll: 821856099038170234,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 3111094252332708278845559,
            expNewGarrison: 3390433053315860134011317
        });
        // random 9
        cs[21] = Case({
            committed: 3269423565665123341184568,
            attackerMod: 796937803703393213,
            garrison: 3047931376797879135342549,
            defenderMod: 1307611898693999116,
            delta: 1300000000000000000,
            gamma: 0,
            beta: 0,
            randomWord: 41744615414498555379362162734812413232824153481957981467868266803253755764850,
            expWon: true,
            expPWad: 326849278196692218,
            expRoll: 266803253755764850,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 3047931376797879135342549,
            expNewGarrison: 3269423565665123341184568
        });
        // random 10
        cs[22] = Case({
            committed: 2305997600505541075662598,
            attackerMod: 877117402392379524,
            garrison: 861392764213407234487525,
            defenderMod: 934448777553361643,
            delta: 1300000000000000000,
            gamma: 500000000000000000,
            beta: 500000000000000000,
            randomWord: 1514772996608075225363822337297217054633104469684253067316388429719063422884,
            expWon: true,
            expPWad: 541573500117456443,
            expRoll: 388429719063422884,
            expToAttacker: 430696382106703617243762,
            expToDefender: 0,
            expBurned: 430696382106703617243763,
            expNewGarrison: 2305997600505541075662598
        });
        // random 11
        cs[23] = Case({
            committed: 615239098564817706550034,
            attackerMod: 514985922204574318,
            garrison: 1659846269426912026252151,
            defenderMod: 1930405449579405884,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 61403816924242978673035372401700297921640912746044305568965159899894784583592,
            expWon: false,
            expPWad: 111061427569479372,
            expRoll: 159899894784583592,
            expToAttacker: 0,
            expToDefender: 184571729569445311965010,
            expBurned: 430667368995372394585024,
            expNewGarrison: 1659846269426912026252151
        });
        // random 12
        cs[24] = Case({
            committed: 1211362376268686649169997,
            attackerMod: 898867185011559722,
            garrison: 4383526327725839688377676,
            defenderMod: 1979200132179222493,
            delta: 1000000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 43319611651737555592653830534213267482871809528085237840039634300033183540264,
            expWon: false,
            expPWad: 192730192508161360,
            expRoll: 634300033183540264,
            expToAttacker: 0,
            expToDefender: 363408712880605994750999,
            expBurned: 847953663388080654418998,
            expNewGarrison: 4383526327725839688377676
        });
        // random 13
        cs[25] = Case({
            committed: 2188857152820315841020016,
            attackerMod: 764587879999966975,
            garrison: 4300726596229331073793624,
            defenderMod: 1439176487598221238,
            delta: 1300000000000000000,
            gamma: 1000000000000000000,
            beta: 0,
            randomWord: 78034978708235243354986147376754795031838892754667756279963056365553302129710,
            expWon: true,
            expPWad: 225734404856224940,
            expRoll: 56365553302129710,
            expToAttacker: 4300726596229331073793624,
            expToDefender: 0,
            expBurned: 0,
            expNewGarrison: 2188857152820315841020016
        });
        // random 14
        cs[26] = Case({
            committed: 3905224055854049951049670,
            attackerMod: 1824860636787519505,
            garrison: 2648199702402305046582738,
            defenderMod: 1907748327681493618,
            delta: 1300000000000000000,
            gamma: 0,
            beta: 0,
            randomWord: 47523410849766775369452953574569985742818501353294733594633138852568750711353,
            expWon: true,
            expPWad: 471887990570500284,
            expRoll: 138852568750711353,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 2648199702402305046582738,
            expNewGarrison: 3905224055854049951049670
        });
        // random 15
        cs[27] = Case({
            committed: 3242259462622679962375560,
            attackerMod: 1598414882280126560,
            garrison: 1189143086342734959284924,
            defenderMod: 1550387736463997743,
            delta: 1300000000000000000,
            gamma: 500000000000000000,
            beta: 500000000000000000,
            randomWord: 99167775146865205682556054708969583023719699629363028658958949553082608715372,
            expWon: false,
            expPWad: 567009893324884591,
            expRoll: 949553082608715372,
            expToAttacker: 0,
            expToDefender: 1621129731311339981187780,
            expBurned: 1621129731311339981187780,
            expNewGarrison: 1189143086342734959284924
        });
        // random 16
        cs[28] = Case({
            committed: 4211805847069233995929419,
            attackerMod: 654520007704317856,
            garrison: 3904860769264605264598893,
            defenderMod: 1207805289388510660,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 23165182472965254194490665022371530433824745040914083058318521089400023898789,
            expWon: false,
            expPWad: 302127436993632604,
            expRoll: 521089400023898789,
            expToAttacker: 0,
            expToDefender: 1263541754120770198778825,
            expBurned: 2948264092948463797150594,
            expNewGarrison: 3904860769264605264598893
        });
        // random 17
        cs[29] = Case({
            committed: 148763511332800189662683,
            attackerMod: 506764323724654258,
            garrison: 3633218897504224438135140,
            defenderMod: 1343288108288867892,
            delta: 1000000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 73929262224310549777196562294796689808225031997897165993898480305223173446951,
            expWon: false,
            expPWad: 70923592050058459,
            expRoll: 480305223173446951,
            expToAttacker: 0,
            expToDefender: 44629053399840056898804,
            expBurned: 104134457932960132763879,
            expNewGarrison: 3633218897504224438135140
        });
        // random 18
        cs[30] = Case({
            committed: 4858796823480596214892299,
            attackerMod: 922513901147250429,
            garrison: 2066742950211027849992820,
            defenderMod: 1529048317373109477,
            delta: 1300000000000000000,
            gamma: 1000000000000000000,
            beta: 0,
            randomWord: 88922261628916060432394957411368581178133609711330800679795634655112716693748,
            expWon: false,
            expPWad: 415747739216126555,
            expRoll: 634655112716693748,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 4858796823480596214892299,
            expNewGarrison: 2066742950211027849992820
        });
        // random 19
        cs[31] = Case({
            committed: 4331295950441900766520508,
            attackerMod: 640260699858018168,
            garrison: 1719003193692233188279496,
            defenderMod: 513747425826094062,
            delta: 1300000000000000000,
            gamma: 0,
            beta: 0,
            randomWord: 76947347855862269652874604880484800406873411483097214594520699049710495945643,
            expWon: false,
            expPWad: 603445087446887147,
            expRoll: 699049710495945643,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 4331295950441900766520508,
            expNewGarrison: 1719003193692233188279496
        });
        // random 20
        cs[32] = Case({
            committed: 702373108983690833323251,
            attackerMod: 1066230837591310502,
            garrison: 4995556400596383792939681,
            defenderMod: 1545466079801174912,
            delta: 1300000000000000000,
            gamma: 500000000000000000,
            beta: 500000000000000000,
            randomWord: 91322829011879262276294312986945631312937989730515351838015879768557383161465,
            expWon: false,
            expPWad: 165967607071729456,
            expRoll: 879768557383161465,
            expToAttacker: 0,
            expToDefender: 351186554491845416661625,
            expBurned: 351186554491845416661626,
            expNewGarrison: 4995556400596383792939681
        });
        // random 21
        cs[33] = Case({
            committed: 1503854814927160648587714,
            attackerMod: 1285085243008190521,
            garrison: 2013887921863936780611030,
            defenderMod: 1917473263025978137,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 50777543267038097110149800559932672320474942583938743064984722570261496804228,
            expWon: false,
            expPWad: 308196316607331847,
            expRoll: 722570261496804228,
            expToAttacker: 0,
            expToDefender: 451156444478148194576314,
            expBurned: 1052698370449012454011400,
            expNewGarrison: 2013887921863936780611030
        });
        // random 22
        cs[34] = Case({
            committed: 825174079887849875797993,
            attackerMod: 1454557185360897349,
            garrison: 3231012281149852191719973,
            defenderMod: 937296419210507449,
            delta: 1000000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 99577793553413243327191739061305597111590919125744178601132097428591551582862,
            expWon: true,
            expPWad: 439542010934870537,
            expRoll: 97428591551582862,
            expToAttacker: 969303684344955657515991,
            expToDefender: 0,
            expBurned: 2261708596804896534203982,
            expNewGarrison: 825174079887849875797993
        });
        // random 23
        cs[35] = Case({
            committed: 754889758452436462153571,
            attackerMod: 794381675916804457,
            garrison: 3114991238145095891669953,
            defenderMod: 1161040332325742627,
            delta: 1300000000000000000,
            gamma: 1000000000000000000,
            beta: 0,
            randomWord: 4002269264900205479601104814583429222485429706750234341211502242703589719380,
            expWon: false,
            expPWad: 205776073916236908,
            expRoll: 502242703589719380,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 754889758452436462153571,
            expNewGarrison: 3114991238145095891669953
        });
        // random 24
        cs[36] = Case({
            committed: 3894298906438762544931078,
            attackerMod: 1930284070982959158,
            garrison: 1761463432082993383048792,
            defenderMod: 1833518590359929178,
            delta: 1300000000000000000,
            gamma: 0,
            beta: 0,
            randomWord: 41520531382454828812287142728820066654062701768981388600154383028017802283457,
            expWon: true,
            expPWad: 546304543458495387,
            expRoll: 383028017802283457,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 1761463432082993383048792,
            expNewGarrison: 3894298906438762544931078
        });
        // random 25
        cs[37] = Case({
            committed: 2252242000245353806516243,
            attackerMod: 1092372529720562488,
            garrison: 2939421442172262267452705,
            defenderMod: 1488989228664026146,
            delta: 1300000000000000000,
            gamma: 500000000000000000,
            beta: 500000000000000000,
            randomWord: 105682409997997806111832477231854589478679764827432216174859369392394547192032,
            expWon: false,
            expPWad: 330648573149241061,
            expRoll: 369392394547192032,
            expToAttacker: 0,
            expToDefender: 1126121000122676903258121,
            expBurned: 1126121000122676903258122,
            expNewGarrison: 2939421442172262267452705
        });
        // random 26
        cs[38] = Case({
            committed: 4064840364212691040972429,
            attackerMod: 1650317424398536042,
            garrison: 1825659698070541739270819,
            defenderMod: 1867779766179982423,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 37077706064947867667130187621011091553773021065084358827828787832056135894124,
            expWon: false,
            expPWad: 503517313069256487,
            expRoll: 787832056135894124,
            expToAttacker: 0,
            expToDefender: 1219452109263807312291728,
            expBurned: 2845388254948883728680701,
            expNewGarrison: 1825659698070541739270819
        });
        // random 27
        cs[39] = Case({
            committed: 4594688134631659030623237,
            attackerMod: 1595470253441929575,
            garrison: 4290237886640600281570534,
            defenderMod: 1484012828722400845,
            delta: 1000000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 9063270357319454058435191633217255726770895645068551528064138750375689145306,
            expWon: true,
            expPWad: 526649243270725158,
            expRoll: 138750375689145306,
            expToAttacker: 1287071365992180084471160,
            expToDefender: 0,
            expBurned: 3003166520648420197099374,
            expNewGarrison: 4594688134631659030623237
        });
        // random 28
        cs[40] = Case({
            committed: 1432730192810338375847066,
            attackerMod: 1839247713359055369,
            garrison: 4009081689404944271912891,
            defenderMod: 1342077653368735624,
            delta: 1300000000000000000,
            gamma: 1000000000000000000,
            beta: 0,
            randomWord: 111696884108190035980006864726676195233920461661901913342533380460767057038152,
            expWon: true,
            expPWad: 386578651919148566,
            expRoll: 380460767057038152,
            expToAttacker: 4009081689404944271912891,
            expToDefender: 0,
            expBurned: 0,
            expNewGarrison: 1432730192810338375847066
        });
        // random 29
        cs[41] = Case({
            committed: 3760721925574329187854698,
            attackerMod: 768361586137802939,
            garrison: 4119673295145837343448197,
            defenderMod: 1884575099749348341,
            delta: 1300000000000000000,
            gamma: 0,
            beta: 0,
            randomWord: 25493672026064029599054711589928249751589702578645692758890517559421778518969,
            expWon: false,
            expPWad: 230561577819622776,
            expRoll: 517559421778518969,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 3760721925574329187854698,
            expNewGarrison: 4119673295145837343448197
        });
        // random 30
        cs[42] = Case({
            committed: 1733912916863154639400857,
            attackerMod: 1937630786928533209,
            garrison: 3769927896570911420970885,
            defenderMod: 1309220786111461188,
            delta: 1300000000000000000,
            gamma: 500000000000000000,
            beta: 500000000000000000,
            randomWord: 87637082129057279905153355567123892674257148250139376103795766129810386885931,
            expWon: false,
            expPWad: 435691163620926663,
            expRoll: 766129810386885931,
            expToAttacker: 0,
            expToDefender: 866956458431577319700428,
            expBurned: 866956458431577319700429,
            expNewGarrison: 3769927896570911420970885
        });
        // random 31
        cs[43] = Case({
            committed: 3519815492748504648991479,
            attackerMod: 520812040147054510,
            garrison: 3207492703751342588062571,
            defenderMod: 1292771595866864283,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 94617661736864780944298778887022213313045493316121829895733537116268580573580,
            expWon: false,
            expPWad: 245074049580029456,
            expRoll: 537116268580573580,
            expToAttacker: 0,
            expToDefender: 1055944647824551394697443,
            expBurned: 2463870844923953254294036,
            expNewGarrison: 3207492703751342588062571
        });
        // random 32
        cs[44] = Case({
            committed: 704937387755563759506760,
            attackerMod: 1982756154854138514,
            garrison: 1873610040250035498242572,
            defenderMod: 1827341630462381006,
            delta: 1000000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 89948449509730223838971243420215671140968252507494722479984043748395379727986,
            expWon: true,
            expPWad: 399600238759866302,
            expRoll: 43748395379727986,
            expToAttacker: 562083012075010649472771,
            expToDefender: 0,
            expBurned: 1311527028175024848769801,
            expNewGarrison: 704937387755563759506760
        });
        // random 33
        cs[45] = Case({
            committed: 2928851704029406736938908,
            attackerMod: 689022736602818038,
            garrison: 861274702666111411978845,
            defenderMod: 1695227116086534992,
            delta: 1300000000000000000,
            gamma: 1000000000000000000,
            beta: 0,
            randomWord: 8931386474978194258854542397760715517230406731811529263539925418367862907059,
            expWon: false,
            expPWad: 365705291522452939,
            expRoll: 925418367862907059,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 2928851704029406736938908,
            expNewGarrison: 861274702666111411978845
        });
        // random 34
        cs[46] = Case({
            committed: 1790390631103229523373634,
            attackerMod: 1914955503729879094,
            garrison: 3612910732279493135667879,
            defenderMod: 564718538387680862,
            delta: 1300000000000000000,
            gamma: 0,
            beta: 0,
            randomWord: 91074238834219588894463343885268569939055779285478554555628506579580685461926,
            expWon: true,
            expPWad: 647420070762913532,
            expRoll: 506579580685461926,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 3612910732279493135667879,
            expNewGarrison: 1790390631103229523373634
        });
        // random 35
        cs[47] = Case({
            committed: 4702187132967881391956154,
            attackerMod: 726117331906863746,
            garrison: 2881626824103312117947045,
            defenderMod: 1415977598838733941,
            delta: 1300000000000000000,
            gamma: 500000000000000000,
            beta: 500000000000000000,
            randomWord: 27612122559396449214731901488567280497284830302338876984055701325599587432171,
            expWon: false,
            expPWad: 335058988520294395,
            expRoll: 701325599587432171,
            expToAttacker: 0,
            expToDefender: 2351093566483940695978077,
            expBurned: 2351093566483940695978077,
            expNewGarrison: 2881626824103312117947045
        });
        // random 36
        cs[48] = Case({
            committed: 1249117377854524920400570,
            attackerMod: 1596110974198478233,
            garrison: 68138473612526965314595,
            defenderMod: 1352362921203726010,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 889491771450590533689023539228725211917265212218327353970435151516726087291,
            expWon: true,
            expPWad: 795381991890869070,
            expRoll: 435151516726087291,
            expToAttacker: 20441542083758089594378,
            expToDefender: 0,
            expBurned: 47696931528768875720217,
            expNewGarrison: 1249117377854524920400570
        });
        // random 37
        cs[49] = Case({
            committed: 4173924484436491826914963,
            attackerMod: 795809420430678436,
            garrison: 3326260928676144482834480,
            defenderMod: 1540575430072413048,
            delta: 1000000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 96570210565109431099207341004397550736641292477505024380186663071420641405529,
            expWon: false,
            expPWad: 366549658756923269,
            expRoll: 663071420641405529,
            expToAttacker: 0,
            expToDefender: 1252177345330947548074488,
            expBurned: 2921747139105544278840475,
            expNewGarrison: 3326260928676144482834480
        });
        // random 38
        cs[50] = Case({
            committed: 1567166530007413862828271,
            attackerMod: 1960922132479460471,
            garrison: 4368457768586840340525873,
            defenderMod: 900952384723798004,
            delta: 1300000000000000000,
            gamma: 1000000000000000000,
            beta: 0,
            randomWord: 26598884650646608522467869897866215173232939296755655930639975718019288093528,
            expWon: false,
            expPWad: 500695760178693250,
            expRoll: 975718019288093528,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 1567166530007413862828271,
            expNewGarrison: 4368457768586840340525873
        });
        // random 39
        cs[51] = Case({
            committed: 2352502581637214581745874,
            attackerMod: 560722314540924212,
            garrison: 349101068837426677352351,
            defenderMod: 769073360675142227,
            delta: 1300000000000000000,
            gamma: 0,
            beta: 0,
            randomWord: 78309679678776090039709276747802890737022573063990976166200235055362657718545,
            expWon: true,
            expPWad: 592814316858052719,
            expRoll: 235055362657718545,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 349101068837426677352351,
            expNewGarrison: 2352502581637214581745874
        });
        // random 40
        cs[52] = Case({
            committed: 2286516494714242664245485,
            attackerMod: 1372748595002486928,
            garrison: 1038710015849829983882185,
            defenderMod: 611482509957523920,
            delta: 1300000000000000000,
            gamma: 500000000000000000,
            beta: 500000000000000000,
            randomWord: 89815945286740197889884759105342935132678869183138263398412709235395917330976,
            expWon: true,
            expPWad: 719270234625475373,
            expRoll: 709235395917330976,
            expToAttacker: 519355007924914991941092,
            expToDefender: 0,
            expBurned: 519355007924914991941093,
            expNewGarrison: 2286516494714242664245485
        });
        // random 41
        cs[53] = Case({
            committed: 2121405427786835945400807,
            attackerMod: 1962521913972383962,
            garrison: 3439351029012940742096489,
            defenderMod: 577951143165518847,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 104595706216222162841037812245461436118613630719622691955134613773522683441535,
            expWon: true,
            expPWad: 672283234804381334,
            expRoll: 613773522683441535,
            expToAttacker: 1031805308703882222628946,
            expToDefender: 0,
            expBurned: 2407545720309058519467543,
            expNewGarrison: 2121405427786835945400807
        });
        // random 42
        cs[54] = Case({
            committed: 2146691496577682924046675,
            attackerMod: 1233840152542098288,
            garrison: 1244168582346825160537157,
            defenderMod: 1169430334971463606,
            delta: 1000000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 100429105858842557298650272391657373575258117667932826452615289426010134242782,
            expWon: true,
            expPWad: 580869746068446585,
            expRoll: 289426010134242782,
            expToAttacker: 373250574704047548161147,
            expToDefender: 0,
            expBurned: 870918007642777612376010,
            expNewGarrison: 2146691496577682924046675
        });
        // random 43
        cs[55] = Case({
            committed: 2807971713286501370013827,
            attackerMod: 1380114462825524549,
            garrison: 2737813871724295243011239,
            defenderMod: 587367547153363053,
            delta: 1300000000000000000,
            gamma: 1000000000000000000,
            beta: 0,
            randomWord: 95797540282437765023672229695801664875526816261203645774849415531264494784822,
            expWon: true,
            expPWad: 646698415514331054,
            expRoll: 415531264494784822,
            expToAttacker: 2737813871724295243011239,
            expToDefender: 0,
            expBurned: 0,
            expNewGarrison: 2807971713286501370013827
        });
        // random 44
        cs[56] = Case({
            committed: 4473494410531740521544298,
            attackerMod: 554238204762141592,
            garrison: 1347639299581908438402699,
            defenderMod: 908643288485129664,
            delta: 1300000000000000000,
            gamma: 0,
            beta: 0,
            randomWord: 8995268404816423165327584660685900035160402151462348598428244189132590480472,
            expWon: true,
            expPWad: 460876499117398328,
            expRoll: 244189132590480472,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 1347639299581908438402699,
            expNewGarrison: 4473494410531740521544298
        });
        // random 45
        cs[57] = Case({
            committed: 2683899224218433130485128,
            attackerMod: 1968765288789892402,
            garrison: 890622067057797812604745,
            defenderMod: 1805077176051294647,
            delta: 1300000000000000000,
            gamma: 500000000000000000,
            beta: 500000000000000000,
            randomWord: 31321392927941466079215071956340882760794971945944221729003191856138108645296,
            expWon: true,
            expPWad: 592906027476649722,
            expRoll: 191856138108645296,
            expToAttacker: 445311033528898906302372,
            expToDefender: 0,
            expBurned: 445311033528898906302373,
            expNewGarrison: 2683899224218433130485128
        });
        // random 46
        cs[58] = Case({
            committed: 2410998014478518779917821,
            attackerMod: 1161451753244784127,
            garrison: 458094338992798403971208,
            defenderMod: 1889672389825583907,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 9470389987781131707309414259285052910081453901907928169734233560371929406345,
            expWon: true,
            expPWad: 520304689797912004,
            expRoll: 233560371929406345,
            expToAttacker: 137428301697839521191362,
            expToDefender: 0,
            expBurned: 320666037294958882779846,
            expNewGarrison: 2410998014478518779917821
        });
        // random 47
        cs[59] = Case({
            committed: 4215628513739455061442791,
            attackerMod: 1578327705419171164,
            garrison: 530283159011581449217385,
            defenderMod: 952808936536428217,
            delta: 1000000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 65421609851926478671734344793996385870058362069829467371983289203531081958036,
            expWon: true,
            expPWad: 823650457776844236,
            expRoll: 289203531081958036,
            expToAttacker: 159084947703474434765215,
            expToDefender: 0,
            expBurned: 371198211308107014452170,
            expNewGarrison: 4215628513739455061442791
        });
        // random 48
        cs[60] = Case({
            committed: 2858088842277691578541407,
            attackerMod: 1775904295533846923,
            garrison: 565497718054800609779403,
            defenderMod: 1510717799119732608,
            delta: 1300000000000000000,
            gamma: 1000000000000000000,
            beta: 0,
            randomWord: 53117681884832754918599268193173071313604672152962215253697816636069098953608,
            expWon: false,
            expPWad: 670282200093957457,
            expRoll: 816636069098953608,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 2858088842277691578541407,
            expNewGarrison: 565497718054800609779403
        });
        // random 49
        cs[61] = Case({
            committed: 136295011616275085434436,
            attackerMod: 652312403004062975,
            garrison: 1695307561078339129279703,
            defenderMod: 1473877767164331891,
            delta: 1300000000000000000,
            gamma: 0,
            beta: 0,
            randomWord: 69306780914934554504756580302410299676426834771508853570918328459700632527,
            expWon: false,
            expPWad: 88033031161922805,
            expRoll: 918328459700632527,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 136295011616275085434436,
            expNewGarrison: 1695307561078339129279703
        });
        // random 50
        cs[62] = Case({
            committed: 3966157948106809319537367,
            attackerMod: 1346122724741310810,
            garrison: 2222138753193675481389215,
            defenderMod: 1177526260622073524,
            delta: 1300000000000000000,
            gamma: 500000000000000000,
            beta: 500000000000000000,
            randomWord: 68216798135692912864503701534164239775884351308915407241645002911849346878688,
            expWon: true,
            expPWad: 540191138259958601,
            expRoll: 2911849346878688,
            expToAttacker: 1111069376596837740694607,
            expToDefender: 0,
            expBurned: 1111069376596837740694608,
            expNewGarrison: 3966157948106809319537367
        });
        // random 51
        cs[63] = Case({
            committed: 3894118539747923703657089,
            attackerMod: 1175529065515114955,
            garrison: 1977977619731166294683879,
            defenderMod: 1244988986570971361,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 42725325092917554365220644742292208162070298234404052748560050696104965829222,
            expWon: true,
            expPWad: 504730754165156951,
            expRoll: 50696104965829222,
            expToAttacker: 593393285919349888405163,
            expToDefender: 0,
            expBurned: 1384584333811816406278716,
            expNewGarrison: 3894118539747923703657089
        });
        // random 52
        cs[64] = Case({
            committed: 3685823304531418792127084,
            attackerMod: 621202122483342322,
            garrison: 4640632967021089599458917,
            defenderMod: 772091588146605780,
            delta: 1000000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 53234109268160462006035817013159623192813603634252107230882690005053972332558,
            expWon: false,
            expPWad: 417602033802738437,
            expRoll: 690005053972332558,
            expToAttacker: 0,
            expToDefender: 1105746991359425637638125,
            expBurned: 2580076313171993154488959,
            expNewGarrison: 4640632967021089599458917
        });
        // random 53
        cs[65] = Case({
            committed: 3487096212819040944543502,
            attackerMod: 500691631005346886,
            garrison: 3457223356871098162944224,
            defenderMod: 1346895348174837200,
            delta: 1300000000000000000,
            gamma: 1000000000000000000,
            beta: 0,
            randomWord: 98305714743019499490483011158545822125191711482245568096580153984599516519718,
            expWon: true,
            expPWad: 223110745542257881,
            expRoll: 153984599516519718,
            expToAttacker: 3457223356871098162944224,
            expToDefender: 0,
            expBurned: 0,
            expNewGarrison: 3487096212819040944543502
        });
        // random 54
        cs[66] = Case({
            committed: 778019086325620807458026,
            attackerMod: 1440696276937551735,
            garrison: 3643718816695874157382834,
            defenderMod: 840799176688451184,
            delta: 1300000000000000000,
            gamma: 0,
            beta: 0,
            randomWord: 56011118325151921044150421211952361741750094642293359176923268805037492678664,
            expWon: true,
            expPWad: 378518823155059690,
            expRoll: 268805037492678664,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 3643718816695874157382834,
            expNewGarrison: 778019086325620807458026
        });
        // random 55
        cs[67] = Case({
            committed: 1688994164652732651068826,
            attackerMod: 1833556916072498579,
            garrison: 956917457996179361172476,
            defenderMod: 1135930293359812648,
            delta: 1300000000000000000,
            gamma: 500000000000000000,
            beta: 500000000000000000,
            randomWord: 76312914407184174225628726821679639126548215375922336821698670518948179761655,
            expWon: false,
            expPWad: 622583215142561608,
            expRoll: 670518948179761655,
            expToAttacker: 0,
            expToDefender: 844497082326366325534413,
            expBurned: 844497082326366325534413,
            expNewGarrison: 956917457996179361172476
        });
        // random 56
        cs[68] = Case({
            committed: 4740737919072025016610910,
            attackerMod: 1025758336812202306,
            garrison: 2605817236837148531569248,
            defenderMod: 1500381151330811742,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 106038093319302543433897441854477116280322286061738003954644311383216876512440,
            expWon: true,
            expPWad: 414977008113389518,
            expRoll: 311383216876512440,
            expToAttacker: 781745171051144559470774,
            expToDefender: 0,
            expBurned: 1824072065786003972098474,
            expNewGarrison: 4740737919072025016610910
        });
        // random 57
        cs[69] = Case({
            committed: 4295917188297930794615385,
            attackerMod: 1241079046592725072,
            garrison: 2295134579288384326688465,
            defenderMod: 700811086762584941,
            delta: 1000000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 8988995276661975812043100886215163722464442384584775548115708715361326986722,
            expWon: false,
            expPWad: 707843812728885354,
            expRoll: 708715361326986722,
            expToAttacker: 0,
            expToDefender: 1288775156489379238384615,
            expBurned: 3007142031808551556230770,
            expNewGarrison: 2295134579288384326688465
        });
        // random 58
        cs[70] = Case({
            committed: 1593565704801786387295416,
            attackerMod: 1438904844696445698,
            garrison: 1968884559527530504859037,
            defenderMod: 1118789310170500402,
            delta: 1300000000000000000,
            gamma: 1000000000000000000,
            beta: 0,
            randomWord: 13667088071662722131862393778016040121296891475761736386345913637600446589535,
            expWon: false,
            expPWad: 470913967398208819,
            expRoll: 913637600446589535,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 1593565704801786387295416,
            expNewGarrison: 1968884559527530504859037
        });
        // random 59
        cs[71] = Case({
            committed: 1140222763646482069676406,
            attackerMod: 1396062350766428715,
            garrison: 4810445093682054989554042,
            defenderMod: 558261276767023330,
            delta: 1300000000000000000,
            gamma: 0,
            beta: 0,
            randomWord: 70176977001460794151585379951020719059587995930475151954503864334440403911721,
            expWon: false,
            expPWad: 483615021036099077,
            expRoll: 864334440403911721,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 1140222763646482069676406,
            expNewGarrison: 4810445093682054989554042
        });
        // random 60
        cs[72] = Case({
            committed: 4407521447956064245023628,
            attackerMod: 1554721564539397274,
            garrison: 4886791690205841693580708,
            defenderMod: 553237549495281956,
            delta: 1300000000000000000,
            gamma: 500000000000000000,
            beta: 500000000000000000,
            randomWord: 76127523922227139360753983742763980572260017433751993358081567261366955749210,
            expWon: true,
            expPWad: 672450269199752728,
            expRoll: 567261366955749210,
            expToAttacker: 2443395845102920846790354,
            expToDefender: 0,
            expBurned: 2443395845102920846790354,
            expNewGarrison: 4407521447956064245023628
        });
        // random 61
        cs[73] = Case({
            committed: 4561387874474016285122071,
            attackerMod: 1014241189880293220,
            garrison: 3127389763901635816598580,
            defenderMod: 651686824778916933,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 30551350643887769193166874577014619737223740044380616368292006611276278720280,
            expWon: true,
            expPWad: 591140403171647741,
            expRoll: 6611276278720280,
            expToAttacker: 938216929170490744979574,
            expToDefender: 0,
            expBurned: 2189172834731145071619006,
            expNewGarrison: 4561387874474016285122071
        });
        // random 62
        cs[74] = Case({
            committed: 4850025487663572840744735,
            attackerMod: 515616066566392845,
            garrison: 1846763551949665914888769,
            defenderMod: 1089034193188440876,
            delta: 1000000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 99414928435556104238884794601139914323495864735033757518599733816924813717012,
            expWon: false,
            expPWad: 434157242545933232,
            expRoll: 733816924813717012,
            expToAttacker: 0,
            expToDefender: 1455007646299071852223420,
            expBurned: 3395017841364500988521315,
            expNewGarrison: 1846763551949665914888769
        });
        // random 63
        cs[75] = Case({
            committed: 563311386335210738128897,
            attackerMod: 1392172777645455617,
            garrison: 2683453135279950881802205,
            defenderMod: 982500422258176877,
            delta: 1300000000000000000,
            gamma: 1000000000000000000,
            beta: 0,
            randomWord: 85005820830183063507040651925741918338743889026528225884111867001557189472446,
            expWon: false,
            expPWad: 333064390641712178,
            expRoll: 867001557189472446,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 563311386335210738128897,
            expNewGarrison: 2683453135279950881802205
        });
        // random 64
        cs[76] = Case({
            committed: 1714379765158958609813900,
            attackerMod: 1242179533786508458,
            garrison: 4140733801294389913396887,
            defenderMod: 1336467722844818468,
            delta: 1300000000000000000,
            gamma: 0,
            beta: 0,
            randomWord: 5421908254501659320398222318981619412988351680511028895611476935880785494702,
            expWon: false,
            expPWad: 315088156382546910,
            expRoll: 476935880785494702,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 1714379765158958609813900,
            expNewGarrison: 4140733801294389913396887
        });
        // random 65
        cs[77] = Case({
            committed: 2831996858706221782898989,
            attackerMod: 517162569570830209,
            garrison: 4086559740969618791724541,
            defenderMod: 1121278466753559197,
            delta: 1300000000000000000,
            gamma: 500000000000000000,
            beta: 500000000000000000,
            randomWord: 45399483532422006157168260785506643461883711882837060738388943745963331956858,
            expWon: false,
            expPWad: 228008171286653155,
            expRoll: 943745963331956858,
            expToAttacker: 0,
            expToDefender: 1415998429353110891449494,
            expBurned: 1415998429353110891449495,
            expNewGarrison: 4086559740969618791724541
        });
        // random 66
        cs[78] = Case({
            committed: 178722708030715839876058,
            attackerMod: 1279308235536225341,
            garrison: 1967404282028824439265248,
            defenderMod: 953467259788340495,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 38842434008817650294670872180671515444509239119210517344166373198720520202679,
            expWon: false,
            expPWad: 237268799416295735,
            expRoll: 373198720520202679,
            expToAttacker: 0,
            expToDefender: 53616812409214751962817,
            expBurned: 125105895621501087913241,
            expNewGarrison: 1967404282028824439265248
        });
        // random 67
        cs[79] = Case({
            committed: 1677984967086995518529339,
            attackerMod: 888755454158287084,
            garrison: 618283518667196367371453,
            defenderMod: 1676977123250442609,
            delta: 1000000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 38752950157545183947144631957649538349339065029069949946012937824399400502313,
            expWon: false,
            expPWad: 466120717825453917,
            expRoll: 937824399400502313,
            expToAttacker: 0,
            expToDefender: 503395490126098655558801,
            expBurned: 1174589476960896862970538,
            expNewGarrison: 618283518667196367371453
        });
        // random 68
        cs[80] = Case({
            committed: 1091208958712804707903745,
            attackerMod: 1436359973650932277,
            garrison: 4403475075758013114268009,
            defenderMod: 692681406411076408,
            delta: 1300000000000000000,
            gamma: 1000000000000000000,
            beta: 0,
            randomWord: 78482631515024756615488208400679629623182317087141516661262799244693477833991,
            expWon: false,
            expPWad: 442598953022299948,
            expRoll: 799244693477833991,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 1091208958712804707903745,
            expNewGarrison: 4403475075758013114268009
        });
        // random 69
        cs[81] = Case({
            committed: 2767282319463327447071929,
            attackerMod: 1811288967848791761,
            garrison: 4115408632260556929464485,
            defenderMod: 1821199575028228982,
            delta: 1300000000000000000,
            gamma: 0,
            beta: 0,
            randomWord: 80237157405752464988299481452022419700250715793870182161752846018691065473389,
            expWon: false,
            expPWad: 385502512517063565,
            expRoll: 846018691065473389,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 2767282319463327447071929,
            expNewGarrison: 4115408632260556929464485
        });
        // random 70
        cs[82] = Case({
            committed: 3151756913202974096658949,
            attackerMod: 584297950536362224,
            garrison: 2977060819450408959905613,
            defenderMod: 1422570581539434312,
            delta: 1300000000000000000,
            gamma: 500000000000000000,
            beta: 500000000000000000,
            randomWord: 776184867689844054436481675651806878999432035533872618440792074742392743813,
            expWon: false,
            expPWad: 245332608193733243,
            expRoll: 792074742392743813,
            expToAttacker: 0,
            expToDefender: 1575878456601487048329474,
            expBurned: 1575878456601487048329475,
            expNewGarrison: 2977060819450408959905613
        });
        // random 71
        cs[83] = Case({
            committed: 721222901562037833773149,
            attackerMod: 1352362178507437907,
            garrison: 927456017107931046595847,
            defenderMod: 1912819256411903773,
            delta: 1300000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 84518500864111745161854231559179918044227331753705774703078309173489535828271,
            expWon: true,
            expPWad: 324133915468631435,
            expRoll: 309173489535828271,
            expToAttacker: 278236805132379313978754,
            expToDefender: 0,
            expBurned: 649219211975551732617093,
            expNewGarrison: 721222901562037833773149
        });
        // random 72
        cs[84] = Case({
            committed: 4986494455420797899605265,
            attackerMod: 1540260471957226276,
            garrison: 373949569939201805870603,
            defenderMod: 1693157862160529992,
            delta: 1000000000000000000,
            gamma: 300000000000000000,
            beta: 300000000000000000,
            randomWord: 15853793049128257937930845683958750639709375535842809796252256532340262188772,
            expWon: true,
            expPWad: 768620821288581406,
            expRoll: 256532340262188772,
            expToAttacker: 112184870981760541761180,
            expToDefender: 0,
            expBurned: 261764698957441264109423,
            expNewGarrison: 4986494455420797899605265
        });
        // random 73
        cs[85] = Case({
            committed: 4709005426089428226871204,
            attackerMod: 944586437135050616,
            garrison: 354243088035594415250221,
            defenderMod: 762508908379481686,
            delta: 1300000000000000000,
            gamma: 1000000000000000000,
            beta: 0,
            randomWord: 81830584910395432760123812815983466274408056330158027114658777929229082023037,
            expWon: false,
            expPWad: 776501359283809804,
            expRoll: 777929229082023037,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 4709005426089428226871204,
            expNewGarrison: 354243088035594415250221
        });
        // random 74
        cs[86] = Case({
            committed: 3200990075151656750563452,
            attackerMod: 1621389064226984076,
            garrison: 2689047203994484611225466,
            defenderMod: 1799005373838326800,
            delta: 1300000000000000000,
            gamma: 0,
            beta: 0,
            randomWord: 4871423066830080989795419271960240553567071428509790517897869551332371820671,
            expWon: false,
            expPWad: 430655222757645079,
            expRoll: 869551332371820671,
            expToAttacker: 0,
            expToDefender: 0,
            expBurned: 3200990075151656750563452,
            expNewGarrison: 2689047203994484611225466
        });
    }
}
