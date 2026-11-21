#include "regulator.h"
#include <algorithm>
#include <random>
#include <chrono>

VertexCoverResult Regulator::vertexCover2Approx() {
    VertexCoverResult result;
    auto edges = graph.getEdges();

    // Standard 2-approximation: pick edge (u, v), add both to cover, remove all edges incident to u or v
    std::vector<bool> covered(edges.size(), false);

    for (size_t i = 0; i < edges.size(); ++i) {
        if (covered[i]) continue;

        const std::string& u = edges[i].from;
        const std::string& v = edges[i].to;

        result.cover.insert(u);
        result.cover.insert(v);

        SimpleJSON step;
        step["type"] = "cover_edge_picked";
        SimpleJSON d;
        d["edge_from"] = u;
        d["edge_to"] = v;
        SimpleJSON nodesArr;
        std::vector<SimpleJSON> arr = {SimpleJSON(u), SimpleJSON(v)};
        d["added_nodes"] = SimpleJSON(arr);
        step["data"] = d;
        result.steps.push_back(step);

        for (size_t j = 0; j < edges.size(); ++j) {
            if (!covered[j]) {
                if (edges[j].from == u || edges[j].to == u ||
                    edges[j].from == v || edges[j].to == v) {
                    covered[j] = true;
                }
            }
        }
    }

    return result;
}

Regulator::KargerGraph Regulator::buildKargerGraph() const {
    KargerGraph kg;
    auto nodeIds = graph.getNodeIds();
    std::map<std::string, int> nodeToId;

    for (const auto& id : nodeIds) {
        int nid = kg.nextId++;
        nodeToId[id] = nid;
        kg.groups[nid] = {id};
    }

    auto edges = graph.getEdges();
    for (const auto& e : edges) {
        if (nodeToId.count(e.from) && nodeToId.count(e.to) && e.from != e.to) {
            kg.edges.push_back({nodeToId[e.from], nodeToId[e.to], e.weight});
        }
    }

    return kg;
}

void Regulator::contractEdge(KargerGraph& kg, int edgeIdx) {
    if (edgeIdx < 0 || edgeIdx >= (int)kg.edges.size()) return;

    int u = std::get<0>(kg.edges[edgeIdx]);
    int v = std::get<1>(kg.edges[edgeIdx]);

    if (u == v) return;

    // Merge group v into group u
    kg.groups[u].insert(kg.groups[u].end(), kg.groups[v].begin(), kg.groups[v].end());
    kg.groups.erase(v);

    // Update edges: replace v with u, remove self-loops
    std::vector<std::tuple<int,int,double>> newEdges;
    for (const auto& e : kg.edges) {
        int eu = std::get<0>(e);
        int ev = std::get<1>(e);
        double w = std::get<2>(e);

        if (eu == v) eu = u;
        if (ev == v) ev = u;

        if (eu != ev) {
            newEdges.push_back({eu, ev, w});
        }
    }
    kg.edges = newEdges;
}

double Regulator::kargerMinCut(KargerGraph kg, std::vector<std::vector<std::string>>& outGroups,
                              std::vector<Edge>& outCutEdges) {
    std::mt19937 rng(1337);

    while (kg.groups.size() > 2 && !kg.edges.empty()) {
        std::uniform_int_distribution<int> dist(0, (int)kg.edges.size() - 1);
        int idx = dist(rng);
        contractEdge(kg, idx);
    }

    outGroups.clear();
    for (const auto& pair : kg.groups) {
        outGroups.push_back(pair.second);
    }

    outCutEdges.clear();
    double totalWeight = 0.0;
    if (outGroups.size() == 2) {
        std::set<std::string> setA(outGroups[0].begin(), outGroups[0].end());
        for (const auto& e : graph.getEdges()) {
            bool aFrom = setA.count(e.from) > 0;
            bool aTo = setA.count(e.to) > 0;
            if (aFrom != aTo) {
                outCutEdges.push_back(e);
                totalWeight += e.weight;
            }
        }
    }

    return totalWeight;
}

KCutResult Regulator::minKCut(int k) {
    KCutResult result;
    auto nodeIds = graph.getNodeIds();
    int n = (int)nodeIds.size();

    if (k <= 1 || n <= 1) {
        result.groups.push_back(nodeIds);
        result.cutWeight = 0.0;
        return result;
    }

    if (k >= n) {
        for (const auto& id : nodeIds) {
            result.groups.push_back({id});
        }
        result.cutEdges = graph.getEdges();
        result.cutWeight = graph.totalEdgeWeight();
        return result;
    }

    // Randomized contraction repeated to contract until k components remain
    int iterations = std::max(20, n * n);
    double bestCutWeight = 1e18;
    std::vector<std::vector<std::string>> bestGroups;
    std::vector<Edge> bestCutEdges;

    std::mt19937 rng((unsigned)std::chrono::system_clock::now().time_since_epoch().count());

    for (int iter = 0; iter < iterations; ++iter) {
        KargerGraph kg = buildKargerGraph();

        while ((int)kg.groups.size() > k && !kg.edges.empty()) {
            std::uniform_int_distribution<int> dist(0, (int)kg.edges.size() - 1);
            int idx = dist(rng);
            contractEdge(kg, idx);
        }

        if ((int)kg.groups.size() == k) {
            std::vector<std::vector<std::string>> currentGroups;
            std::map<std::string, int> nodeToGroup;
            int gIdx = 0;
            for (const auto& pair : kg.groups) {
                currentGroups.push_back(pair.second);
                for (const auto& member : pair.second) {
                    nodeToGroup[member] = gIdx;
                }
                gIdx++;
            }

            double currentCutWeight = 0.0;
            std::vector<Edge> currentCutEdges;
            for (const auto& e : graph.getEdges()) {
                if (nodeToGroup[e.from] != nodeToGroup[e.to]) {
                    currentCutWeight += e.weight;
                    currentCutEdges.push_back(e);
                }
            }

            if (currentCutWeight < bestCutWeight) {
                bestCutWeight = currentCutWeight;
                bestGroups = currentGroups;
                bestCutEdges = currentCutEdges;
            }
        }
    }

    if (bestGroups.empty()) {
        // Fallback: round-robin partition
        bestGroups.resize(k);
        for (size_t i = 0; i < nodeIds.size(); ++i) {
            bestGroups[i % k].push_back(nodeIds[i]);
        }
        bestCutWeight = 0.0;
    }

    result.groups = bestGroups;
    result.cutEdges = bestCutEdges;
    result.cutWeight = (bestCutWeight > 1e17) ? 0.0 : bestCutWeight;

    SimpleJSON step;
    step["type"] = "kcut_formed";
    SimpleJSON d;
    d["k"] = k;
    d["cut_weight"] = result.cutWeight;
    step["data"] = d;
    result.steps.push_back(step);

    return result;
}
