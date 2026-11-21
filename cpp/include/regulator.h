#pragma once
#include "graph.h"
#include "json_helper.h"
#include <vector>
#include <string>
#include <set>

struct VertexCoverResult {
    std::set<std::string> cover;
    std::vector<SimpleJSON> steps;
};

struct KCutResult {
    std::vector<std::vector<std::string>> groups;
    std::vector<Edge> cutEdges;
    double cutWeight;
    std::vector<SimpleJSON> steps;
};

class Regulator {
public:
    explicit Regulator(const Graph& g) : graph(g) {}

    VertexCoverResult vertexCover2Approx();
    KCutResult minKCut(int k);

private:
    const Graph& graph;

    // Karger contraction helpers
    struct KargerGraph {
        // super-node -> original nodes
        std::map<int, std::vector<std::string>> groups;
        // multi-edges as list of (u,v,w)
        std::vector<std::tuple<int,int,double>> edges;
        int nextId = 0;
    };

    KargerGraph buildKargerGraph() const;
    void contractEdge(KargerGraph& kg, int edgeIdx);
    double kargerMinCut(KargerGraph kg, std::vector<std::vector<std::string>>& outGroups,
                        std::vector<Edge>& outCutEdges);
};
