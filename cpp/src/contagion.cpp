#include "contagion.h"
#include <algorithm>
#include <iostream>
#include <cmath>

CascadeResult Contagion::simulateCascade(const std::string& defaultedNode, int rounds) {
    CascadeResult result;
    result.totalDefaulted = 0;

    std::map<std::string, double> capital;
    for (const auto& pair : graph.nodes) {
        capital[pair.first] = pair.second.capital;
    }

    std::set<std::string> defaulted;
    if (!defaultedNode.empty() && capital.count(defaultedNode)) {
        defaulted.insert(defaultedNode);
        capital[defaultedNode] = 0.0;
    }

    ContagionRound initialRound;
    initialRound.round = 0;
    if (!defaultedNode.empty()) {
        initialRound.newlyDefaulted.push_back(defaultedNode);
        
        SimpleJSON stepObj;
        stepObj["type"] = "node_defaulted";
        SimpleJSON data;
        data["node"] = defaultedNode;
        data["round"] = 0;
        data["reason"] = "initial_trigger";
        stepObj["data"] = data;
        result.steps.push_back(stepObj);
    }
    result.rounds.push_back(initialRound);

    std::vector<std::string> currentWave = initialRound.newlyDefaulted;

    for (int r = 1; r <= rounds; ++r) {
        if (currentWave.empty()) break;

        ContagionRound roundData;
        roundData.round = r;

        SimpleJSON rStart;
        rStart["type"] = "round_start";
        SimpleJSON rData;
        rData["round"] = r;
        rStart["data"] = rData;
        result.steps.push_back(rStart);

        std::map<std::string, double> roundLosses;
        std::vector<std::string> nextWave;

        // In obligation network: u -> v means u owes v.
        // If u defaults, v loses the money u owed it.
        for (const auto& u : currentWave) {
            auto it = graph.adjList.find(u);
            if (it != graph.adjList.end()) {
                for (const auto& edge : it->second) {
                    const std::string& v = edge.first;
                    double obligation = edge.second;

                    if (defaulted.count(v) == 0) {
                        roundLosses[v] += obligation;
                    }
                }
            }
        }

        // Apply losses to capital buffers
        for (const auto& pair : roundLosses) {
            const std::string& v = pair.first;
            double loss = pair.second;
            roundData.losses[v] = loss;

            capital[v] -= loss;

            SimpleJSON lossStep;
            lossStep["type"] = "loss_incurred";
            SimpleJSON lData;
            lData["node"] = v;
            lData["loss"] = loss;
            lData["remainingCapital"] = std::max(0.0, capital[v]);
            lossStep["data"] = lData;
            result.steps.push_back(lossStep);

            if (capital[v] <= 0.0 && defaulted.count(v) == 0) {
                defaulted.insert(v);
                nextWave.push_back(v);
                roundData.newlyDefaulted.push_back(v);

                SimpleJSON defStep;
                defStep["type"] = "node_defaulted";
                SimpleJSON dData;
                dData["node"] = v;
                dData["round"] = r;
                dData["reason"] = "capital_depleted";
                defStep["data"] = dData;
                result.steps.push_back(defStep);
            }
        }

        result.rounds.push_back(roundData);
        currentWave = nextWave;
    }

    result.totalDefaulted = (int)defaulted.size();
    return result;
}

DebtRankResult Contagion::computeDebtRank(int maxIter) {
    DebtRankResult result;
    auto nodeIds = graph.getNodeIds();
    int n = (int)nodeIds.size();
    if (n == 0) return result;

    // DebtRank: recursive feedback impact
    // For each institution i, calculate total assets/capital
    std::map<std::string, double> capital;
    double totalCapital = 0.0;
    for (const auto& id : nodeIds) {
        double c = graph.nodes.count(id) ? graph.nodes.at(id).capital : 1000.0;
        if (c <= 0) c = 1.0;
        capital[id] = c;
        totalCapital += c;
    }

    // Interbank exposure matrix Pi[j][i] = relative exposure of j to i
    // i owes j amount W(i, j). If i defaults, j loses W(i, j), relative to capital[j]
    std::map<std::string, std::map<std::string, double>> Pi;
    for (const auto& i : nodeIds) {
        auto it = graph.adjList.find(i);
        if (it != graph.adjList.end()) {
            for (const auto& edge : it->second) {
                const std::string& j = edge.first;
                double w = edge.second;
                Pi[j][i] += w / capital[j]; // impact on j when i fails
            }
        }
    }

    // Initial distress: score based on economic size / central weight
    std::map<std::string, double> h;
    for (const auto& id : nodeIds) {
        h[id] = 1.0 / n;
    }

    double damping = 0.85;

    for (int iter = 1; iter <= maxIter; ++iter) {
        std::map<std::string, double> hNext;
        for (const auto& j : nodeIds) {
            double incoming = 0.0;
            for (const auto& i : nodeIds) {
                if (Pi[j].count(i)) {
                    incoming += h[i] * Pi[j][i];
                }
            }
            hNext[j] = (1.0 - damping) / n + damping * incoming;
        }

        // Normalize
        double sum = 0.0;
        for (const auto& pair : hNext) sum += pair.second;
        if (sum > 0) {
            for (auto& pair : hNext) pair.second /= sum;
        }

        h = hNext;

        SimpleJSON stepObj;
        stepObj["type"] = "debtrank_iteration";
        SimpleJSON stepData;
        stepData["iteration"] = iter;
        SimpleJSON scoresObj;
        for (const auto& pair : h) {
            scoresObj[pair.first] = pair.second;
        }
        stepData["scores"] = scoresObj;
        stepObj["data"] = stepData;
        result.steps.push_back(stepObj);
    }

    // Scale scores to 0.0 - 1.0 range with maximum normalized
    double maxScore = 0.0;
    for (const auto& pair : h) {
        if (pair.second > maxScore) maxScore = pair.second;
    }
    if (maxScore > 0) {
        for (const auto& pair : h) {
            result.scores[pair.first] = pair.second / maxScore;
        }
    } else {
        result.scores = h;
    }

    return result;
}

void Contagion::apDFS(const std::string& u, std::set<std::string>& visited) {
    visited.insert(u);
    ap_visited[u] = true;
    ap_disc[u] = ap_low[u] = ++ap_timer;
    int children = 0;

    // Collect all neighbors in undirected sense
    std::set<std::string> neighbors;
    auto it = graph.adjList.find(u);
    if (it != graph.adjList.end()) {
        for (const auto& edge : it->second) neighbors.insert(edge.first);
    }
    // Also incoming edges
    for (const auto& fromPair : graph.adjList) {
        if (fromPair.second.count(u)) neighbors.insert(fromPair.first);
    }

    for (const auto& v : neighbors) {
        if (v == ap_parent[u]) continue;

        if (ap_visited[v]) {
            ap_low[u] = std::min(ap_low[u], ap_disc[v]);
        } else {
            children++;
            ap_parent[v] = u;
            apDFS(v, visited);

            ap_low[u] = std::min(ap_low[u], ap_low[v]);

            // Articulation point condition
            if (ap_parent[u].empty() && children > 1) {
                ap_set.insert(u);
            }
            if (!ap_parent[u].empty() && ap_low[v] >= ap_disc[u]) {
                ap_set.insert(u);
            }

            // Bridge condition
            if (ap_low[v] > ap_disc[u]) {
                double w = graph.edgeWeight(u, v);
                if (w == 0) w = graph.edgeWeight(v, u);
                bridge_set.push_back({u, v, w});
            }
        }
    }
}

ArticulationResult Contagion::findArticulationPoints() {
    ArticulationResult result;
    ap_timer = 0;
    ap_disc.clear();
    ap_low.clear();
    ap_visited.clear();
    ap_parent.clear();
    ap_set.clear();
    bridge_set.clear();

    std::set<std::string> visited;
    auto nodeIds = graph.getNodeIds();

    for (const auto& u : nodeIds) {
        if (!ap_visited[u]) {
            apDFS(u, visited);
        }
    }

    for (const auto& ap : ap_set) {
        result.articulationPoints.push_back(ap);
        SimpleJSON step;
        step["type"] = "articulation_point";
        SimpleJSON d;
        d["node"] = ap;
        step["data"] = d;
        result.steps.push_back(step);
    }

    result.bridges = bridge_set;
    for (const auto& b : bridge_set) {
        SimpleJSON step;
        step["type"] = "bridge";
        SimpleJSON d;
        d["from"] = b.from;
        d["to"] = b.to;
        d["weight"] = b.weight;
        step["data"] = d;
        result.steps.push_back(step);
    }

    return result;
}

ArticulationResult Contagion::findBridges() {
    return findArticulationPoints();
}

std::string Contagion::ufFind(const std::string& x) {
    if (uf_parent[x] == x) return x;
    return uf_parent[x] = ufFind(uf_parent[x]);
}

void Contagion::ufUnion(const std::string& x, const std::string& y) {
    std::string rootX = ufFind(x);
    std::string rootY = ufFind(y);
    if (rootX != rootY) {
        if (uf_rank[rootX] < uf_rank[rootY]) {
            uf_parent[rootX] = rootY;
        } else if (uf_rank[rootX] > uf_rank[rootY]) {
            uf_parent[rootY] = rootX;
        } else {
            uf_parent[rootY] = rootX;
            uf_rank[rootX]++;
        }
    }
}

MSTResult Contagion::maxSpanningTree() {
    MSTResult result;
    result.totalWeight = 0.0;

    auto nodeIds = graph.getNodeIds();
    uf_parent.clear();
    uf_rank.clear();
    for (const auto& id : nodeIds) {
        uf_parent[id] = id;
        uf_rank[id] = 0;
    }

    auto edges = graph.getEdges();
    // Sort descending for Maximum Spanning Tree
    std::sort(edges.begin(), edges.end(), [](const Edge& a, const Edge& b) {
        return a.weight > b.weight;
    });

    for (const auto& e : edges) {
        if (ufFind(e.from) != ufFind(e.to)) {
            ufUnion(e.from, e.to);
            result.edges.push_back(e);
            result.totalWeight += e.weight;

            SimpleJSON step;
            step["type"] = "mst_edge";
            SimpleJSON d;
            d["from"] = e.from;
            d["to"] = e.to;
            d["weight"] = e.weight;
            step["data"] = d;
            result.steps.push_back(step);
        }
    }

    return result;
}
