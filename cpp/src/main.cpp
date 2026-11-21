#include <iostream>
#include <string>
#include <sstream>
#include "graph.h"
#include "netting.h"
#include "settlement.h"
#include "liquidity.h"
#include "contagion.h"
#include "regulator.h"
#include "json_helper.h"

static Graph buildGraphFromJSON(const SimpleJSON& root) {
    Graph g;
    if (root.has("nodes") && root["nodes"].isArray()) {
        for (const auto& nVal : root["nodes"].getArray()) {
            Node n;
            n.id = nVal.has("id") ? nVal["id"].getString() : "";
            n.capital = nVal.has("capital") ? nVal["capital"].getDouble() : 1000.0;
            n.liquidity = nVal.has("liquidity") ? nVal["liquidity"].getDouble() : 500.0;
            n.defaulted = nVal.has("defaulted") ? nVal["defaulted"].getBool() : false;
            if (!n.id.empty()) {
                g.addNode(n);
            }
        }
    }
    if (root.has("edges") && root["edges"].isArray()) {
        for (const auto& eVal : root["edges"].getArray()) {
            std::string from = eVal.has("from") ? eVal["from"].getString() : "";
            std::string to = eVal.has("to") ? eVal["to"].getString() : "";
            double weight = eVal.has("weight") ? eVal["weight"].getDouble() : 0.0;
            if (!from.empty() && !to.empty() && weight > 0) {
                g.addEdge(from, to, weight);
            }
        }
    }
    return g;
}

static SimpleJSON nodeToJSON(const Node& n) {
    SimpleJSON obj = makeObject();
    obj["id"] = SimpleJSON(n.id);
    obj["capital"] = SimpleJSON(n.capital);
    obj["liquidity"] = SimpleJSON(n.liquidity);
    obj["defaulted"] = SimpleJSON(n.defaulted);
    obj["debtRank"] = SimpleJSON(n.debtRank);
    return obj;
}

static SimpleJSON edgeToJSON(const Edge& e) {
    SimpleJSON obj = makeObject();
    obj["from"] = SimpleJSON(e.from);
    obj["to"] = SimpleJSON(e.to);
    obj["weight"] = SimpleJSON(e.weight);
    return obj;
}

static SimpleJSON graphStatsJSON(const Graph& g) {
    SimpleJSON stats = makeObject();
    stats["totalNodes"] = SimpleJSON((int)g.getNodeIds().size());
    stats["totalEdges"] = SimpleJSON((int)g.getEdges().size());
    stats["totalGrossVolume"] = SimpleJSON(g.totalEdgeWeight());
    stats["isWeaklyConnected"] = SimpleJSON(g.isWeaklyConnected());
    stats["isStronglyConnected"] = SimpleJSON(g.isStronglyConnected());

    auto netPositions = g.computeNetPositions();
    SimpleJSON netPosObj = makeObject();
    for (const auto& [id, net] : netPositions) {
        netPosObj[id] = SimpleJSON(net);
    }
    stats["netPositions"] = netPosObj;
    return stats;
}

static SimpleJSON graphToJSON(const Graph& g) {
    SimpleJSON root = makeObject();
    std::vector<SimpleJSON> nodesArr;
    for (const auto& [id, n] : g.nodes) {
        nodesArr.push_back(nodeToJSON(n));
    }
    root["nodes"] = SimpleJSON(nodesArr);

    std::vector<SimpleJSON> edgesArr;
    for (const auto& e : g.getEdges()) {
        edgesArr.push_back(edgeToJSON(e));
    }
    root["edges"] = SimpleJSON(edgesArr);
    root["stats"] = graphStatsJSON(g);
    return root;
}

static std::string processLine(const std::string& line) {
    if (line.empty()) return "";

    SimpleJSON req;
    try {
        req = SimpleJSON::parse(line);
    } catch (const std::exception& e) {
        SimpleJSON resp = makeObject();
        resp["status"] = SimpleJSON("error");
        resp["error"] = SimpleJSON(std::string("JSON parse error: ") + e.what());
        resp["result"] = SimpleJSON();
        resp["steps"] = makeArray();
        return resp.serialize();
    }

    std::string command = req.has("command") ? req["command"].getString() : "";
    SimpleJSON params = req.has("params") ? req["params"] : makeObject();

    Graph g = buildGraphFromJSON(req);

    SimpleJSON resp = makeObject();
    resp["status"] = SimpleJSON("ok");
    resp["error"] = SimpleJSON("");
    SimpleJSON result = makeObject();
    std::vector<SimpleJSON> steps;

    try {
        if (command == "graph.load" || command == "graph.stats") {
            result = graphToJSON(g);
        }
        else if (command == "graph.generate") {
            std::string type = params.has("type") ? params["type"].getString() : "core_periphery";
            int n = params.has("n") ? params["n"].getInt() : 8;
            if (n < 2) n = 2;
            if (n > 50) n = 50;

            Graph gen;
            if (type == "scale_free") {
                gen = Graph::generateScaleFree(n);
            } else if (type == "random") {
                gen = Graph::generateRandom(n, 0.35);
            } else {
                gen = Graph::generateCorePeriphery(n);
            }
            result = graphToJSON(gen);
        }
        else if (command == "graph.bfs") {
            std::string src = params.has("source") ? params["source"].getString() : "";
            if (src.empty() && !g.getNodeIds().empty()) src = g.getNodeIds()[0];
            auto bfsRes = g.bfs(src);
            std::vector<SimpleJSON> visitedArr;
            for (const auto& id : bfsRes.visited) visitedArr.push_back(SimpleJSON(id));
            result["visited"] = SimpleJSON(visitedArr);
            std::vector<SimpleJSON> treeEdgesArr;
            for (const auto& e : bfsRes.treeEdges) treeEdgesArr.push_back(edgeToJSON(e));
            result["treeEdges"] = SimpleJSON(treeEdgesArr);
        }
        else if (command == "graph.dfs") {
            std::string src = params.has("source") ? params["source"].getString() : "";
            if (src.empty() && !g.getNodeIds().empty()) src = g.getNodeIds()[0];
            auto dfsRes = g.dfs(src);
            std::vector<SimpleJSON> visitedArr;
            for (const auto& id : dfsRes.visited) visitedArr.push_back(SimpleJSON(id));
            result["visited"] = SimpleJSON(visitedArr);
            std::vector<SimpleJSON> treeEdgesArr;
            for (const auto& e : dfsRes.treeEdges) treeEdgesArr.push_back(edgeToJSON(e));
            result["treeEdges"] = SimpleJSON(treeEdgesArr);
            std::vector<SimpleJSON> backEdgesArr;
            for (const auto& e : dfsRes.backEdges) backEdgesArr.push_back(edgeToJSON(e));
            result["backEdges"] = SimpleJSON(backEdgesArr);
        }
        else if (command == "netting.run") {
            Netting netting(g);
            NettingResult nRes = netting.runMultilateralNetting();

            std::vector<SimpleJSON> cancelledArr;
            for (const auto& c : nRes.cancelledCycles) {
                std::vector<SimpleJSON> cArr;
                for (const auto& id : c) cArr.push_back(SimpleJSON(id));
                cancelledArr.push_back(SimpleJSON(cArr));
            }
            result["cancelledCycles"] = SimpleJSON(cancelledArr);

            std::vector<SimpleJSON> remArr;
            for (const auto& e : nRes.removedEdges) remArr.push_back(edgeToJSON(e));
            result["removedEdges"] = SimpleJSON(remArr);

            result["originalTotal"] = SimpleJSON(nRes.originalTotal);
            result["newTotal"] = SimpleJSON(nRes.newTotal);
            result["savingsPct"] = SimpleJSON(nRes.savingsPct);

            SimpleJSON beforePos = makeObject();
            for (const auto& [id, net] : nRes.netPositionsBefore) beforePos[id] = SimpleJSON(net);
            result["netPositionsBefore"] = beforePos;

            SimpleJSON afterPos = makeObject();
            for (const auto& [id, net] : nRes.netPositionsAfter) afterPos[id] = SimpleJSON(net);
            result["netPositionsAfter"] = afterPos;

            std::vector<SimpleJSON> remEdgesArr;
            for (const auto& e : g.getEdges()) remEdgesArr.push_back(edgeToJSON(e));
            result["nettedEdges"] = SimpleJSON(remEdgesArr);

            for (const auto& step : nRes.steps) {
                SimpleJSON sObj = makeObject();
                sObj["type"] = SimpleJSON(step.type);
                sObj["data"] = step.data;
                steps.push_back(sObj);
            }
        }
        else if (command == "netting.bilateral") {
            Netting netting(g);
            NettingResult nRes = netting.runBilateralNetting();

            result["originalTotal"] = SimpleJSON(nRes.originalTotal);
            result["newTotal"] = SimpleJSON(nRes.newTotal);
            result["savingsPct"] = SimpleJSON(nRes.savingsPct);

            std::vector<SimpleJSON> remEdgesArr;
            for (const auto& e : g.getEdges()) remEdgesArr.push_back(edgeToJSON(e));
            result["nettedEdges"] = SimpleJSON(remEdgesArr);

            for (const auto& step : nRes.steps) {
                SimpleJSON sObj = makeObject();
                sObj["type"] = SimpleJSON(step.type);
                sObj["data"] = step.data;
                steps.push_back(sObj);
            }
        }
        else if (command == "netting.positions") {
            auto positions = g.computeNetPositions();
            SimpleJSON posObj = makeObject();
            for (const auto& [id, net] : positions) posObj[id] = SimpleJSON(net);
            result["netPositions"] = posObj;
        }
        else if (command == "settlement.toposort") {
            Settlement settlement(g);
            TopoResult tRes = settlement.topologicalSort();
            result["success"] = SimpleJSON(tRes.success);
            result["errorMsg"] = SimpleJSON(tRes.errorMsg);

            std::vector<SimpleJSON> ordArr;
            for (const auto& id : tRes.order) ordArr.push_back(SimpleJSON(id));
            result["order"] = SimpleJSON(ordArr);

            std::vector<SimpleJSON> sccArr;
            for (const auto& comp : tRes.sccs) {
                std::vector<SimpleJSON> compArr;
                for (const auto& id : comp) compArr.push_back(SimpleJSON(id));
                sccArr.push_back(SimpleJSON(compArr));
            }
            result["sccs"] = SimpleJSON(sccArr);

            for (const auto& step : tRes.steps) {
                SimpleJSON sObj = makeObject();
                sObj["type"] = SimpleJSON(step.type);
                sObj["data"] = step.data;
                steps.push_back(sObj);
            }
        }
        else if (command == "settlement.scc") {
            Settlement settlement(g);
            SCCResult sRes = settlement.findSCC();

            std::vector<SimpleJSON> sccArr;
            for (const auto& comp : sRes.sccs) {
                std::vector<SimpleJSON> compArr;
                for (const auto& id : comp) compArr.push_back(SimpleJSON(id));
                sccArr.push_back(SimpleJSON(compArr));
            }
            result["sccs"] = SimpleJSON(sccArr);

            std::vector<SimpleJSON> gridArr;
            for (const auto& comp : sRes.gridlocks) {
                std::vector<SimpleJSON> compArr;
                for (const auto& id : comp) compArr.push_back(SimpleJSON(id));
                gridArr.push_back(SimpleJSON(compArr));
            }
            result["gridlocks"] = SimpleJSON(gridArr);

            for (const auto& step : sRes.steps) {
                SimpleJSON sObj = makeObject();
                sObj["type"] = SimpleJSON(step.type);
                sObj["data"] = step.data;
                steps.push_back(sObj);
            }
        }
        else if (command == "liquidity.maxflow") {
            std::string src = params.has("source") ? params["source"].getString() : "";
            std::string sink = params.has("sink") ? params["sink"].getString() : "";
            auto nodeIds = g.getNodeIds();
            if (src.empty() && nodeIds.size() >= 2) src = nodeIds[0];
            if (sink.empty() && nodeIds.size() >= 2) sink = nodeIds[nodeIds.size() - 1];

            Liquidity liq(g);
            MaxFlowResult mfRes = liq.maxFlow(src, sink);
            result["maxFlow"] = SimpleJSON(mfRes.maxFlow);
            result["source"] = SimpleJSON(src);
            result["sink"] = SimpleJSON(sink);

            SimpleJSON flowMap = makeObject();
            for (const auto& [u, row] : mfRes.flowOnEdge) {
                SimpleJSON uMap = makeObject();
                for (const auto& [v, f] : row) {
                    uMap[v] = SimpleJSON(f);
                }
                flowMap[u] = uMap;
            }
            result["flowOnEdge"] = flowMap;

            std::vector<SimpleJSON> pathsArr;
            for (const auto& path : mfRes.augmentingPaths) {
                std::vector<SimpleJSON> pArr;
                for (const auto& id : path) pArr.push_back(SimpleJSON(id));
                pathsArr.push_back(SimpleJSON(pArr));
            }
            result["augmentingPaths"] = SimpleJSON(pathsArr);

            for (const auto& step : mfRes.steps) {
                SimpleJSON sObj = makeObject();
                sObj["type"] = SimpleJSON(step.type);
                sObj["data"] = step.data;
                steps.push_back(sObj);
            }
        }
        else if (command == "liquidity.mincut") {
            std::string src = params.has("source") ? params["source"].getString() : "";
            std::string sink = params.has("sink") ? params["sink"].getString() : "";
            auto nodeIds = g.getNodeIds();
            if (src.empty() && nodeIds.size() >= 2) src = nodeIds[0];
            if (sink.empty() && nodeIds.size() >= 2) sink = nodeIds[nodeIds.size() - 1];

            Liquidity liq(g);
            MinCutResult mcRes = liq.minCut(src, sink);
            result["cutCapacity"] = SimpleJSON(mcRes.cutCapacity);
            result["source"] = SimpleJSON(src);
            result["sink"] = SimpleJSON(sink);

            std::vector<SimpleJSON> edgesArr;
            for (const auto& e : mcRes.cutEdges) edgesArr.push_back(edgeToJSON(e));
            result["cutEdges"] = SimpleJSON(edgesArr);

            std::vector<SimpleJSON> sArr, tArr;
            for (const auto& id : mcRes.sideS) sArr.push_back(SimpleJSON(id));
            for (const auto& id : mcRes.sideT) tArr.push_back(SimpleJSON(id));
            result["sideS"] = SimpleJSON(sArr);
            result["sideT"] = SimpleJSON(tArr);
        }
        else if (command == "liquidity.dijkstra") {
            std::string src = params.has("source") ? params["source"].getString() : "";
            if (src.empty() && !g.getNodeIds().empty()) src = g.getNodeIds()[0];

            Liquidity liq(g);
            ShortestPathResult spRes = liq.dijkstra(src);

            SimpleJSON distObj = makeObject();
            for (const auto& [id, d] : spRes.dist) distObj[id] = SimpleJSON(d);
            result["dist"] = distObj;

            SimpleJSON prevObj = makeObject();
            for (const auto& [id, p] : spRes.prev) prevObj[id] = SimpleJSON(p);
            result["prev"] = prevObj;

            for (const auto& step : spRes.steps) {
                SimpleJSON sObj = makeObject();
                sObj["type"] = SimpleJSON(step.type);
                sObj["data"] = step.data;
                steps.push_back(sObj);
            }
        }
        else if (command == "liquidity.bellman") {
            std::string src = params.has("source") ? params["source"].getString() : "";
            if (src.empty() && !g.getNodeIds().empty()) src = g.getNodeIds()[0];

            Liquidity liq(g);
            ShortestPathResult spRes = liq.bellmanFord(src);

            SimpleJSON distObj = makeObject();
            for (const auto& [id, d] : spRes.dist) distObj[id] = SimpleJSON(d);
            result["dist"] = distObj;

            SimpleJSON prevObj = makeObject();
            for (const auto& [id, p] : spRes.prev) prevObj[id] = SimpleJSON(p);
            result["prev"] = prevObj;

            result["negativeCycle"] = SimpleJSON(spRes.negativeCycle);
            std::vector<SimpleJSON> cycleArr;
            for (const auto& id : spRes.negativeCycleNodes) cycleArr.push_back(SimpleJSON(id));
            result["negativeCycleNodes"] = SimpleJSON(cycleArr);

            for (const auto& step : spRes.steps) {
                SimpleJSON sObj = makeObject();
                sObj["type"] = SimpleJSON(step.type);
                sObj["data"] = step.data;
                steps.push_back(sObj);
            }
        }
        else if (command == "contagion.simulate") {
            std::string defNode = params.has("defaultedNode") ? params["defaultedNode"].getString() : "";
            int rounds = params.has("rounds") ? params["rounds"].getInt() : 10;

            Contagion cont(g);
            CascadeResult cRes = cont.simulateCascade(defNode, rounds);

            result["totalDefaulted"] = SimpleJSON(cRes.totalDefaulted);

            std::vector<SimpleJSON> roundsArr;
            for (const auto& r : cRes.rounds) {
                SimpleJSON rObj = makeObject();
                rObj["round"] = SimpleJSON(r.round);
                std::vector<SimpleJSON> ndArr;
                for (const auto& id : r.newlyDefaulted) ndArr.push_back(SimpleJSON(id));
                rObj["newlyDefaulted"] = SimpleJSON(ndArr);

                SimpleJSON lossObj = makeObject();
                for (const auto& [id, loss] : r.losses) lossObj[id] = SimpleJSON(loss);
                rObj["losses"] = lossObj;
                roundsArr.push_back(rObj);
            }
            result["rounds"] = SimpleJSON(roundsArr);
            steps = cRes.steps;
        }
        else if (command == "contagion.debtrank") {
            int maxIter = params.has("maxIter") ? params["maxIter"].getInt() : 20;
            Contagion cont(g);
            DebtRankResult drRes = cont.computeDebtRank(maxIter);

            SimpleJSON scoresObj = makeObject();
            for (const auto& [id, s] : drRes.scores) scoresObj[id] = SimpleJSON(s);
            result["scores"] = scoresObj;
            steps = drRes.steps;
        }
        else if (command == "contagion.articulation") {
            Contagion cont(g);
            ArticulationResult apRes = cont.findArticulationPoints();

            std::vector<SimpleJSON> apArr;
            for (const auto& id : apRes.articulationPoints) apArr.push_back(SimpleJSON(id));
            result["articulationPoints"] = SimpleJSON(apArr);

            std::vector<SimpleJSON> brArr;
            for (const auto& e : apRes.bridges) brArr.push_back(edgeToJSON(e));
            result["bridges"] = SimpleJSON(brArr);

            steps = apRes.steps;
        }
        else if (command == "contagion.bridges") {
            Contagion cont(g);
            ArticulationResult apRes = cont.findBridges();

            std::vector<SimpleJSON> brArr;
            for (const auto& e : apRes.bridges) brArr.push_back(edgeToJSON(e));
            result["bridges"] = SimpleJSON(brArr);
            steps = apRes.steps;
        }
        else if (command == "contagion.mst") {
            Contagion cont(g);
            MSTResult mstRes = cont.maxSpanningTree();

            result["totalWeight"] = SimpleJSON(mstRes.totalWeight);
            std::vector<SimpleJSON> edgesArr;
            for (const auto& e : mstRes.edges) edgesArr.push_back(edgeToJSON(e));
            result["edges"] = SimpleJSON(edgesArr);
            steps = mstRes.steps;
        }
        else if (command == "regulator.vertexcover") {
            Regulator reg(g);
            VertexCoverResult vcRes = reg.vertexCover2Approx();

            std::vector<SimpleJSON> coverArr;
            for (const auto& id : vcRes.cover) coverArr.push_back(SimpleJSON(id));
            result["cover"] = SimpleJSON(coverArr);
            steps = vcRes.steps;
        }
        else if (command == "regulator.kcut") {
            int k = params.has("k") ? params["k"].getInt() : 2;
            Regulator reg(g);
            KCutResult kcRes = reg.minKCut(k);

            std::vector<SimpleJSON> groupsArr;
            for (const auto& grp : kcRes.groups) {
                std::vector<SimpleJSON> gArr;
                for (const auto& id : grp) gArr.push_back(SimpleJSON(id));
                groupsArr.push_back(SimpleJSON(gArr));
            }
            result["groups"] = SimpleJSON(groupsArr);

            std::vector<SimpleJSON> edgesArr;
            for (const auto& e : kcRes.cutEdges) edgesArr.push_back(edgeToJSON(e));
            result["cutEdges"] = SimpleJSON(edgesArr);

            result["cutWeight"] = SimpleJSON(kcRes.cutWeight);
            steps = kcRes.steps;
        }
        else {
            resp["status"] = SimpleJSON("error");
            resp["error"] = SimpleJSON("Unknown command: " + command);
        }
    } catch (const std::exception& ex) {
        resp["status"] = SimpleJSON("error");
        resp["error"] = SimpleJSON(std::string("Execution exception: ") + ex.what());
    }

    resp["result"] = result;
    resp["steps"] = SimpleJSON(steps);
    return resp.serialize();
}

int main() {
    std::ios_base::sync_with_stdio(false);
    std::cin.tie(NULL);

    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        std::string out = processLine(line);
        std::cout << out << "\n" << std::flush;
    }
    return 0;
}
