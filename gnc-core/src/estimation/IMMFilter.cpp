#define _USE_MATH_DEFINES
#include <gnc-core/estimation/IMMFilter.hpp>
#include <stdexcept>
#include <cmath>

namespace gnc {
namespace estimation {

void IMMFilter::setup(const std::vector<std::shared_ptr<AbstractFilter>>& models, const Eigen::MatrixXd& transition_matrix) {
    if (models.empty()) {
        throw std::runtime_error("IMMFilter: Must provide at least one model.");
    }
    if (transition_matrix.rows() != models.size() || transition_matrix.cols() != models.size()) {
        throw std::runtime_error("IMMFilter: Transition matrix dimensions must match number of models.");
    }
    
    models_ = models;
    transition_matrix_ = transition_matrix;
    
    int n = models_.size();
    mode_probabilities_ = Eigen::VectorXd::Constant(n, 1.0 / n);
}

void IMMFilter::initialize(const Eigen::VectorXd& initial_state, const Eigen::MatrixXd& initial_covariance) {
    state_ = initial_state;
    covariance_ = initial_covariance;
    
    for (auto& model : models_) {
        model->initialize(initial_state, initial_covariance);
    }
}

void IMMFilter::predict(const Eigen::VectorXd& u, double dt) {
    int r = models_.size();
    
    // Compute mixing probabilities
    Eigen::VectorXd c_bar = transition_matrix_.transpose() * mode_probabilities_;
    Eigen::MatrixXd mixing_probs(r, r);
    for (int i = 0; i < r; ++i) {
        for (int j = 0; j < r; ++j) {
            mixing_probs(i, j) = transition_matrix_(i, j) * mode_probabilities_(i) / c_bar(j);
        }
    }

    // Mix states and covariances
    std::vector<Eigen::VectorXd> mixed_states(r);
    std::vector<Eigen::MatrixXd> mixed_covs(r);

    for (int j = 0; j < r; ++j) {
        mixed_states[j] = Eigen::VectorXd::Zero(state_.size());
        for (int i = 0; i < r; ++i) {
            mixed_states[j] += mixing_probs(i, j) * models_[i]->getState();
        }

        mixed_covs[j] = Eigen::MatrixXd::Zero(covariance_.rows(), covariance_.cols());
        for (int i = 0; i < r; ++i) {
            Eigen::VectorXd diff = models_[i]->getState() - mixed_states[j];
            mixed_covs[j] += mixing_probs(i, j) * (models_[i]->getCovariance() + diff * diff.transpose());
        }
    }

    // Update individual models and predict
    for (int j = 0; j < r; ++j) {
        models_[j]->initialize(mixed_states[j], mixed_covs[j]);
        models_[j]->predict(u, dt);
    }

    mode_probabilities_ = c_bar;
}

void IMMFilter::update(const Eigen::VectorXd& z, std::shared_ptr<AbstractMeasurementModel> measurement_model) {
    int r = models_.size();
    Eigen::VectorXd likelihoods(r);
    
    for (int j = 0; j < r; ++j) {
        // Individual update
        Eigen::VectorXd pre_update_state = models_[j]->getState();
        Eigen::MatrixXd pre_update_cov = models_[j]->getCovariance();
        
        models_[j]->update(z, measurement_model);
        
        // Approximate likelihood calculation (Gaussian PDF of the residual)
        Eigen::VectorXd z_pred = measurement_model->predictMeasurement(pre_update_state);
        Eigen::VectorXd residual = z - z_pred;
        
        Eigen::MatrixXd H = measurement_model->getMeasurementJacobian(pre_update_state);
        Eigen::MatrixXd R = measurement_model->getMeasurementNoiseCovariance();
        Eigen::MatrixXd S = H * pre_update_cov * H.transpose() + R;
        
        double det = S.determinant();
        double exp_term = -0.5 * residual.transpose() * S.inverse() * residual;
        likelihoods(j) = (1.0 / std::sqrt(std::pow(2 * M_PI, z.size()) * det)) * std::exp(exp_term);
    }

    // Update mode probabilities
    mode_probabilities_ = mode_probabilities_.cwiseProduct(likelihoods);
    mode_probabilities_ /= mode_probabilities_.sum();

    // Combine estimates
    state_ = Eigen::VectorXd::Zero(state_.size());
    for (int j = 0; j < r; ++j) {
        state_ += mode_probabilities_(j) * models_[j]->getState();
    }

    covariance_ = Eigen::MatrixXd::Zero(covariance_.rows(), covariance_.cols());
    for (int j = 0; j < r; ++j) {
        Eigen::VectorXd diff = models_[j]->getState() - state_;
        covariance_ += mode_probabilities_(j) * (models_[j]->getCovariance() + diff * diff.transpose());
    }
}

Eigen::VectorXd IMMFilter::getState() const {
    return state_;
}

Eigen::MatrixXd IMMFilter::getCovariance() const {
    return covariance_;
}

} // namespace estimation
} // namespace gnc
