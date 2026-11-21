#pragma once
#include "graph.h"
#include "json_helper.h"
#include <vector>
#include <string>
#include <map>

struct ContagionRound {
    int round;
    std::vector<std::string> newlyDefaulted;
    std::map<std::string, double> losses; // creditor -> loss amount
};

struct CascadeResult {
    std::vector<ContagionRound> rounds;
    int totalDefaulted;
    std::vector<SimpleJSON> steps;
};

struct DebtRankResult {
    std::map<std::string, double> scores;
    std::vector<SimpleJSON> steps; // iteration_k steps
};

struct ArticulationResult {
    std::vector<std::string> articulationPoints;
    std::vector<Edge> bridges;
    std::vector<SimpleJSON> steps;
};

struct MSTResult {
    std::vector<Edge> edges;
    double totalWeight;
    std::vector<SimpleJSON> steps;
};

class Contagion {
public:
    explicit Contagion(Graph& g) : graph(g) {}

    CascadeResult simulateCascade(const std::string& defaultedNode, int rounds);
    DebtRankResult computeDebtRank(int maxIter = 20);
    ArticulationResult findArticulationPoints();
    ArticulationResult findBridges(); // returns bridges only
    MSTResult maxSpanningTree();

private:
    Graph& graph;

    // AP/Bridge DFS helpers
    int ap_timer = 0;
    std::map<std::string, int> ap_disc;
    std::map<std::string, int> ap_low;
    std::map<std::string, bool> ap_visited;
    std::map<std::string, std::string> ap_parent;
    std::set<std::string> ap_set;
    std::vector<Edge> bridge_set;

    void apDFS(const std::string& u, std::set<std::string>& visited);

    // Union-Find for Kruskal
    std::map<std::string, std::string> uf_parent;
    std::map<std::string, int> uf_rank;
    std::string ufFind(const std::string& x);
    void ufUnion(const std::string& x, const std::string& y);
};
